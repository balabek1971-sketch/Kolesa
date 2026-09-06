package sms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Mobizon struct {
	endpoint   string
	apiKey     string
	senderName string
	client     *http.Client
}

type mobizonResponse struct {
	Code int             `json:"code"`
	Data json.RawMessage `json:"data"`
}

type mobizonData struct {
	MessageID any `json:"messageId"`
}

func NewMobizon(baseURL, apiKey, senderName string, client *http.Client) *Mobizon {
	if client == nil {
		client = &http.Client{Timeout: 3500 * time.Millisecond}
	}

	return &Mobizon{
		endpoint:   strings.TrimRight(baseURL, "/") + "/service/message/sendSmsMessage",
		apiKey:     apiKey,
		senderName: senderName,
		client:     client,
	}
}

func (m *Mobizon) SendOTP(ctx context.Context, phone, otp string) (Result, error) {
	normalizedPhone, ok := normalizeKazakhstanPhone(phone)
	if !ok {
		return Result{}, errors.New("phone must be a Kazakhstan number in E.164 format")
	}
	if !otpPattern.MatchString(otp) {
		return Result{}, errors.New("OTP must contain 4 to 8 digits")
	}
	if m.apiKey == "" {
		return Result{}, errors.New("mobizon is not configured")
	}

	endpoint, err := url.Parse(m.endpoint)
	if err != nil {
		return Result{}, errors.New("invalid mobizon endpoint")
	}
	query := endpoint.Query()
	query.Set("output", "json")
	query.Set("api", "v1")
	query.Set("apiKey", m.apiKey)
	endpoint.RawQuery = query.Encode()

	form := url.Values{
		"recipient":        {strings.TrimPrefix(normalizedPhone, "+")},
		"text":             {fmt.Sprintf(otpMessageTemplate, otp)},
		"params[validity]": {"60"},
	}
	if m.senderName != "" {
		form.Set("from", m.senderName)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), strings.NewReader(form.Encode()))
	if err != nil {
		return Result{}, errors.New("failed to create mobizon request")
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")

	response, err := m.client.Do(request)
	if err != nil {
		// net/http errors can contain the full URL, including the API key query value.
		return Result{}, errors.New("mobizon request failed")
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return Result{}, errors.New("failed to read mobizon response")
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return Result{}, fmt.Errorf("mobizon returned HTTP %d", response.StatusCode)
	}

	var payload mobizonResponse
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return Result{}, errors.New("mobizon returned an invalid response")
	}
	if payload.Code != 0 {
		return Result{}, mobizonProviderError(payload)
	}

	var data mobizonData
	if err := json.Unmarshal(payload.Data, &data); err != nil {
		return Result{}, errors.New("mobizon returned invalid message data")
	}

	messageID := scalarString(data.MessageID)
	if messageID == "" {
		return Result{}, errors.New("mobizon response did not include a message ID")
	}

	return Result{Provider: "mobizon", MessageID: messageID}, nil
}

func mobizonProviderError(payload mobizonResponse) error {
	fields := mobizonValidationFields(payload.Data)
	if len(fields) == 0 {
		return fmt.Errorf("mobizon rejected the message with code %d", payload.Code)
	}

	return fmt.Errorf("mobizon rejected the message with code %d (fields: %s)", payload.Code, strings.Join(fields, ", "))
}

func mobizonValidationFields(raw json.RawMessage) []string {
	var data map[string]json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &data) != nil {
		return nil
	}

	fields := make([]string, 0, len(data))
	for field := range data {
		if safeProviderFieldName(field) {
			fields = append(fields, field)
		}
	}
	sort.Strings(fields)
	return fields
}

func safeProviderFieldName(field string) bool {
	if field == "" || len(field) > 64 {
		return false
	}
	for _, character := range field {
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' ||
			strings.ContainsRune("_.-[]", character) {
			continue
		}
		return false
	}
	return true
}

func scalarString(value any) string {
	switch typed := value.(type) {
	case json.Number:
		return typed.String()
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}
