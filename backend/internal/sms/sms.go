package sms

import "context"

type Result struct {
	Provider  string
	MessageID string
}

type Sender interface {
	SendOTP(ctx context.Context, phone, otp string) (Result, error)
}
