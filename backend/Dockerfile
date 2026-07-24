FROM golang:1.23-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/qazauto-api ./cmd/api

FROM alpine:3.21

RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S -G app app
USER app
WORKDIR /app
COPY --from=build /out/qazauto-api /app/qazauto-api

EXPOSE 8080
ENTRYPOINT ["/app/qazauto-api"]

