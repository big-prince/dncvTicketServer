# WhatsApp Notification Integration Guide

This document explains how to set up WhatsApp notifications for admin alerts in the DNCV Ticketing System.

## Overview

The system supports sending WhatsApp notifications to admins in two scenarios:

1. When a customer completes a purchase
2. When a customer marks a bank transfer as completed (requiring urgent verification)

## Setup Options

There are two options for implementing WhatsApp notifications:

### Option 1: Meta WhatsApp Business API (Recommended)

**Cost:** Starts with free tier (1,000 conversations per month), then $0.0086 per conversation

**Setup:**

1. Create a Meta Business Account: https://business.facebook.com/
2. Set up WhatsApp Business API in the Meta Business Dashboard
3. Complete the verification process
4. Create a WhatsApp Business API system user and generate access tokens
5. Add the following environment variables to your `.env` file:

```
ENABLE_WHATSAPP_NOTIFICATIONS=true
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
ADMIN_WHATSAPP_NUMBERS=234XXXXXXXXXX,234XXXXXXXXXX
```

### Option 2: Twilio WhatsApp API

**Cost:** $0.005 per message + Twilio fees

**Setup:**

1. Create a Twilio account: https://www.twilio.com/
2. Enable WhatsApp messaging in your Twilio account
3. Complete the verification process
4. Get your Account SID and Auth Token
5. Add the following environment variables to your `.env` file:

```
ENABLE_WHATSAPP_NOTIFICATIONS=true
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
ADMIN_WHATSAPP_NUMBERS=+234XXXXXXXXXX,+234XXXXXXXXXX
```

## Testing

To test your WhatsApp integration:

1. Ensure the environment variables are set correctly
2. Run the server
3. Make a test purchase or mark a transfer as completed
4. Check your WhatsApp for notifications

## Important Notes

- WhatsApp Business API requires approval of message templates for non-customer-initiated conversations
- Numbers must be properly formatted (Meta: no '+' sign, Twilio: include '+' sign)
- Each admin number must be approved in your WhatsApp Business account
- The WhatsApp API has rate limits, and excessive messaging can lead to temporary blocks

## Troubleshooting

If notifications are not being sent:

1. Check the server logs for any errors
2. Verify that the environment variables are set correctly
3. Ensure your WhatsApp Business account is active and in good standing
4. Confirm that the admin phone numbers are in the correct format
5. Check that your message templates have been approved (Meta API)

For further assistance, contact your WhatsApp Business API provider or Twilio support.
