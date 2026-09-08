package repository

import (
	"context"
	"net/http"
	"net/url"
	"time"
)

type PushSubscription struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	Endpoint   string `json:"endpoint"`
	P256DH     string `json:"p256dh"`
	AuthSecret string `json:"auth_secret"`
}

type MessageNotification struct {
	MessageID      string
	ConversationID string
	SenderID       string
	RecipientID    string
	Body           string
	ListingTitle   string
}

func (c *Client) UpsertPushSubscription(ctx context.Context, userID, endpoint, p256dh, authSecret, userAgent string) error {
	query := url.Values{"on_conflict": []string{"endpoint"}}
	body := map[string]any{
		"user_id": userID, "endpoint": endpoint, "p256dh": p256dh, "auth_secret": authSecret,
		"user_agent": userAgent, "last_seen_at": time.Now().UTC().Format(time.RFC3339),
	}
	return c.requestWithPrefer(ctx, http.MethodPost, "/push_subscriptions?"+query.Encode(), body, nil, "resolution=merge-duplicates,return=minimal")
}

func (c *Client) DeletePushSubscription(ctx context.Context, userID, endpoint string) error {
	query := url.Values{"user_id": []string{"eq." + userID}, "endpoint": []string{"eq." + endpoint}}
	return c.request(ctx, http.MethodDelete, "/push_subscriptions?"+query.Encode(), nil, nil, false)
}

func (c *Client) DeletePushSubscriptionByID(ctx context.Context, subscriptionID string) error {
	return c.request(ctx, http.MethodDelete, "/push_subscriptions?id=eq."+url.QueryEscape(subscriptionID), nil, nil, false)
}

func (c *Client) ListPushSubscriptions(ctx context.Context, userID string) ([]PushSubscription, error) {
	query := url.Values{"user_id": []string{"eq." + userID}, "select": []string{"id,user_id,endpoint,p256dh,auth_secret"}}
	var rows []PushSubscription
	if err := c.get(ctx, "/push_subscriptions?"+query.Encode(), &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (c *Client) GetMessageNotification(ctx context.Context, messageID string) (MessageNotification, error) {
	messageQuery := url.Values{
		"id": []string{"eq." + messageID}, "deleted_at": []string{"is.null"},
		"select": []string{"id,conversation_id,sender_id,body"}, "limit": []string{"1"},
	}
	var messages []struct {
		ID             string `json:"id"`
		ConversationID string `json:"conversation_id"`
		SenderID       string `json:"sender_id"`
		Body           string `json:"body"`
	}
	if err := c.get(ctx, "/messages?"+messageQuery.Encode(), &messages); err != nil {
		return MessageNotification{}, err
	}
	if len(messages) != 1 {
		return MessageNotification{}, ErrNotFound
	}

	conversationQuery := url.Values{
		"id":     []string{"eq." + messages[0].ConversationID},
		"select": []string{"id,buyer_id,seller_id,listing_id"}, "limit": []string{"1"},
	}
	var conversations []struct {
		ID        string `json:"id"`
		BuyerID   string `json:"buyer_id"`
		SellerID  string `json:"seller_id"`
		ListingID string `json:"listing_id"`
	}
	if err := c.get(ctx, "/conversations?"+conversationQuery.Encode(), &conversations); err != nil {
		return MessageNotification{}, err
	}
	if len(conversations) != 1 {
		return MessageNotification{}, ErrNotFound
	}
	recipientID := conversations[0].BuyerID
	if recipientID == messages[0].SenderID {
		recipientID = conversations[0].SellerID
	}

	listingQuery := url.Values{"id": []string{"eq." + conversations[0].ListingID}, "select": []string{"title"}, "limit": []string{"1"}}
	var listings []struct {
		Title string `json:"title"`
	}
	if err := c.get(ctx, "/listings?"+listingQuery.Encode(), &listings); err != nil {
		return MessageNotification{}, err
	}
	title := "Объявление"
	if len(listings) == 1 && listings[0].Title != "" {
		title = listings[0].Title
	}
	return MessageNotification{
		MessageID: messages[0].ID, ConversationID: messages[0].ConversationID,
		SenderID: messages[0].SenderID, RecipientID: recipientID,
		Body: messages[0].Body, ListingTitle: title,
	}, nil
}

func (c *Client) ClaimPushDelivery(ctx context.Context, messageID, subscriptionID string) (bool, error) {
	query := url.Values{"on_conflict": []string{"message_id,subscription_id"}}
	var rows []struct {
		MessageID string `json:"message_id"`
	}
	err := c.requestWithPrefer(ctx, http.MethodPost, "/push_deliveries?"+query.Encode(), map[string]string{
		"message_id": messageID, "subscription_id": subscriptionID,
	}, &rows, "resolution=ignore-duplicates,return=representation")
	return len(rows) == 1, err
}

func (c *Client) CompletePushDelivery(ctx context.Context, messageID, subscriptionID string, status int) error {
	query := url.Values{"message_id": []string{"eq." + messageID}, "subscription_id": []string{"eq." + subscriptionID}}
	return c.patch(ctx, "/push_deliveries?"+query.Encode(), map[string]any{
		"delivered_at": time.Now().UTC().Format(time.RFC3339), "response_status": status, "last_error": nil,
	})
}

func (c *Client) ReleasePushDelivery(ctx context.Context, messageID, subscriptionID string) error {
	query := url.Values{"message_id": []string{"eq." + messageID}, "subscription_id": []string{"eq." + subscriptionID}}
	return c.request(ctx, http.MethodDelete, "/push_deliveries?"+query.Encode(), nil, nil, false)
}
