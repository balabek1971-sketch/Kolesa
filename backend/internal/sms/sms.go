package sms

import (
	"context"
	"regexp"
	"strings"
)

const otpMessageTemplate = "QazAuto: kod vhoda %s. Nikomu ne soobshchaite ego."

var (
	kazakhstanPhonePattern = regexp.MustCompile(`^7\d{10}$`)
	otpPattern             = regexp.MustCompile(`^\d{4,8}$`)
)

type Result struct {
	Provider  string
	MessageID string
}

type Sender interface {
	SendOTP(ctx context.Context, phone, otp string) (Result, error)
}

func normalizeKazakhstanPhone(phone string) (string, bool) {
	digits := strings.TrimPrefix(strings.TrimSpace(phone), "+")
	if !kazakhstanPhonePattern.MatchString(digits) {
		return "", false
	}
	return "+" + digits, true
}
