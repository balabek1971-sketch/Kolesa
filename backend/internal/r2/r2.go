package r2

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

const (
	algorithm       = "AWS4-HMAC-SHA256"
	region          = "auto"
	service         = "s3"
	unsignedPayload = "UNSIGNED-PAYLOAD"
)

type Client struct {
	accountID string
	accessKey string
	secretKey string
	bucket    string
	http      *http.Client
	now       func() time.Time
}

type ObjectInfo struct {
	ContentType string
	SizeBytes   int64
}

func New(accountID, accessKey, secretKey, bucket string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{
		accountID: accountID,
		accessKey: accessKey,
		secretKey: secretKey,
		bucket:    bucket,
		http:      httpClient,
		now:       time.Now,
	}
}

func (c *Client) Configured() bool {
	return c != nil && c.accountID != "" && c.accessKey != "" && c.secretKey != "" && c.bucket != ""
}

func (c *Client) PresignPut(objectKey, contentType string, expires time.Duration) (string, error) {
	if !c.Configured() {
		return "", errors.New("r2 is not configured")
	}
	return c.presign(http.MethodPut, objectKey, contentType, expires)
}

func (c *Client) HeadObject(ctx context.Context, objectKey string) (ObjectInfo, error) {
	signedURL, err := c.presign(http.MethodHead, objectKey, "", 2*time.Minute)
	if err != nil {
		return ObjectInfo{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodHead, signedURL, nil)
	if err != nil {
		return ObjectInfo{}, err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return ObjectInfo{}, err
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode != http.StatusOK {
		return ObjectInfo{}, fmt.Errorf("r2 head returned %s", response.Status)
	}

	return ObjectInfo{
		ContentType: response.Header.Get("Content-Type"),
		SizeBytes:   response.ContentLength,
	}, nil
}

func (c *Client) presign(method, objectKey, contentType string, expires time.Duration) (string, error) {
	if expires < time.Second || expires > 7*24*time.Hour {
		return "", errors.New("invalid presign expiration")
	}

	now := c.now().UTC()
	date := now.Format("20060102")
	timestamp := now.Format("20060102T150405Z")
	scope := fmt.Sprintf("%s/%s/%s/aws4_request", date, region, service)
	host := fmt.Sprintf("%s.r2.cloudflarestorage.com", c.accountID)
	canonicalPath := objectPath(c.bucket, objectKey)
	signedHeaders := "host"
	canonicalHeaders := "host:" + host + "\n"
	if contentType != "" {
		signedHeaders = "content-type;host"
		canonicalHeaders = "content-type:" + strings.TrimSpace(contentType) + "\n" + canonicalHeaders
	}

	query := url.Values{}
	query.Set("X-Amz-Algorithm", algorithm)
	query.Set("X-Amz-Credential", c.accessKey+"/"+scope)
	query.Set("X-Amz-Date", timestamp)
	query.Set("X-Amz-Expires", fmt.Sprintf("%d", int(expires.Seconds())))
	query.Set("X-Amz-SignedHeaders", signedHeaders)
	canonicalQuery := query.Encode()

	canonicalRequest := strings.Join([]string{
		method,
		canonicalPath,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		unsignedPayload,
	}, "\n")
	requestHash := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		algorithm,
		timestamp,
		scope,
		hex.EncodeToString(requestHash[:]),
	}, "\n")
	signature := hex.EncodeToString(hmacSHA256(signingKey(c.secretKey, date), stringToSign))
	query.Set("X-Amz-Signature", signature)

	return "https://" + host + canonicalPath + "?" + query.Encode(), nil
}

func objectPath(bucket, objectKey string) string {
	segments := strings.Split(path.Clean("/"+bucket+"/"+strings.TrimLeft(objectKey, "/")), "/")
	for index, segment := range segments {
		segments[index] = url.PathEscape(segment)
	}
	return strings.Join(segments, "/")
}

func signingKey(secret, date string) []byte {
	dateKey := hmacSHA256([]byte("AWS4"+secret), date)
	regionKey := hmacSHA256(dateKey, region)
	serviceKey := hmacSHA256(regionKey, service)
	return hmacSHA256(serviceKey, "aws4_request")
}

func hmacSHA256(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}
