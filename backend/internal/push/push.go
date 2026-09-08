package push

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	webpush "github.com/SherClockHolmes/webpush-go"
)

var ErrDisabled = errors.New("web push is not configured")

type Subscription struct {
	Endpoint string
	P256DH   string
	Auth     string
}

type Notification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
	Badge int    `json:"badge"`
}

type Result struct {
	StatusCode int
}

type Sender interface {
	Send(context.Context, Subscription, Notification) (Result, error)
}

type WebPushSender struct {
	publicKey  string
	privateKey string
	subject    string
	httpClient *http.Client
}

func New(publicKey, privateKey, subject string, httpClient *http.Client) *WebPushSender {
	return &WebPushSender{
		publicKey: publicKey, privateKey: privateKey, subject: subject, httpClient: httpClient,
	}
}

func (s *WebPushSender) Enabled() bool {
	return s.publicKey != "" && s.privateKey != "" && s.subject != ""
}

func (s *WebPushSender) Send(ctx context.Context, subscription Subscription, notification Notification) (Result, error) {
	if !s.Enabled() {
		return Result{}, ErrDisabled
	}
	payload, err := json.Marshal(notification)
	if err != nil {
		return Result{}, err
	}
	response, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: subscription.Endpoint,
		Keys:     webpush.Keys{P256dh: subscription.P256DH, Auth: subscription.Auth},
	}, &webpush.Options{
		HTTPClient:      s.httpClient,
		Subscriber:      s.subject,
		TTL:             86400,
		Urgency:         webpush.UrgencyHigh,
		VAPIDPublicKey:  s.publicKey,
		VAPIDPrivateKey: s.privateKey,
	})
	if err != nil {
		return Result{}, err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Result{StatusCode: response.StatusCode}, errors.New("push service rejected notification")
	}
	return Result{StatusCode: response.StatusCode}, nil
}
