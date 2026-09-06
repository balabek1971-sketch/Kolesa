package sms

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type AutoCall struct {
	endpoint string
	token    string
	client   *http.Client
}

type autoCallRequest struct {
	Name       string              `json:"name"`
	Text       string              `json:"text"`
	Recipients []autoCallRecipient `json:"list_id"`
}

type autoCallRecipient struct {
	Number string `json:"number"`
}

type autoCallResponse struct {
	ID any `json:"id"`
}

func NewAutoCall(baseURL, token string, client *http.Client) *AutoCall {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}

	return &AutoCall{
		endpoint: strings.TrimRight(baseURL, "/") + "/bulks",
		token:    token,
		client:   client,
	}
}

func (a *AutoCall) SendOTP(ctx context.Context, phone, otp string) (Result, error) {
	normalizedPhone, ok := normalizeKazakhstanPhone(phone)
	if !ok {
		return Result{}, errors.New("phone must be a Kazakhstan number in E.164 format")
	}
	if !otpPattern.MatchString(otp) {
		return Result{}, errors.New("OTP must contain 4 to 8 digits")
	}
	if a.token == "" {
		return Result{}, errors.New("autocall is not configured")
	}

	payload := autoCallRequest{
		Name: "QazAuto OTP",
		Text: fmt.Sprintf(otpMessageTemplate, otp),
		Recipients: []autoCallRecipient{
			{Number: normalizedPhone},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Result{}, errors.New("failed to encode autocall request")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint, bytes.NewReader(body))
	if err != nil {
		return Result{}, errors.New("failed to create autocall request")
	}
	request.Header.Set("Authorization", "Bearer "+a.token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := a.client.Do(request)
	if err != nil {
		return Result{}, errors.New("autocall request failed")
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return Result{}, errors.New("failed to read autocall response")
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return Result{}, fmt.Errorf("autocall returned HTTP %d", response.StatusCode)
	}

	var result autoCallResponse
	decoder := json.NewDecoder(bytes.NewReader(responseBody))
	decoder.UseNumber()
	if err := decoder.Decode(&result); err != nil {
		return Result{}, errors.New("autocall returned an invalid response")
	}
	messageID := scalarString(result.ID)
	if messageID == "" {
		return Result{}, errors.New("autocall response did not include a campaign ID")
	}

	return Result{Provider: "autocall", MessageID: messageID}, nil
}
