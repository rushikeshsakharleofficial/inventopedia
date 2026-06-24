FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN go build -o /out/inventopedia-api ./cmd/api

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/inventopedia-api /app/inventopedia-api
EXPOSE 8080
CMD ["/app/inventopedia-api"]
