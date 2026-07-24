package sms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const otpMessageTemplate = "QazAuto: kod vhoda %s. Nikomu ne soobshchaite ego."

var (
	kazakhstanPhonePattern = regexp.MustCompile(`^\+7\d{10}$`)
	otpPattern             = regexp.MustCompile(`^\d{4,8}$`)
)

type Mobizon struct {
	endpoint   string
	apiKey     string
	senderName string
	client     *http.Client
}

type mobizonResponse struct {
	Code    int         `json:"code"`
	Data    mobizonData `json:"data"`
	Message string      `json:"message"`
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
	if !kazakhstanPhonePattern.MatchString(phone) {
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
		"recipient":        {strings.TrimPrefix(phone, "+")},
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
		return Result{}, fmt.Errorf("mobizon rejected the message with code %d", payload.Code)
	}

	messageID := scalarString(payload.Data.MessageID)
	if messageID == "" {
		return Result{}, errors.New("mobizon response did not include a message ID")
	}

	return Result{Provider: "mobizon", MessageID: messageID}, nil
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
