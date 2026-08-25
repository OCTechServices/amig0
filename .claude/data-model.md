# Firestore Data Model — amig0
# OCTech Services | Last Updated: 2026-04-19
# This document is the source of truth for all collection schemas.
# Update here first before touching any module.

---

## Collection Map

```
clients
tours
  └─ itineraries/          (sub-collection)
passengers
bookings
quotes
invoices
  └─ payments/             (sub-collection — future)
providers
briefings
guides
documents
activities                 (future)
destinations               (future)
reviews                    (future)
group_threads              (future)
```

---

## clients
Internal client accounts (travel agents, group organisers, companies).

| Field       | Type      | Notes                        |
|-------------|-----------|------------------------------|
| id          | auto      | Firestore document ID        |
| name        | string    | Full name or company name    |
| email       | string    |                              |
| phone       | string    |                              |
| country     | string    |                              |
| notes       | string    | Internal operator notes      |
| createdAt   | timestamp |                              |
| updatedAt   | timestamp |                              |

---

## tours
Tour definitions — the core record everything links to.

| Field        | Type       | Notes                                              |
|--------------|------------|----------------------------------------------------|
| id           | auto       |                                                    |
| name         | string     | Tour display name                                  |
| destination  | string     | Primary destination                                |
| startDate    | timestamp  |                                                    |
| endDate      | timestamp  |                                                    |
| capacity     | number     | Max passengers                                     |
| status       | string     | draft · confirmed · active · completed · cancelled |
| guideId      | string     | ref → guides                                       |
| providerIds  | string[]   | refs → providers                                   |
| price        | number     | Base price per passenger                           |
| currency     | string     | ISO 4217 (e.g. USD, EUR, GBP)                      |
| notes        | string     |                                                    |
| createdAt    | timestamp  |                                                    |
| updatedAt    | timestamp  |                                                    |

---

## tours/{tourId}/itineraries (sub-collection)
Day-by-day schedule — consumed by client portal and guide app.

| Field        | Type      | Notes                        |
|--------------|-----------|------------------------------|
| id           | auto      |                              |
| day          | number    | Day number (1, 2, 3…)        |
| date         | timestamp |                              |
| title        | string    | e.g. "Arrival & City Tour"   |
| description  | string    |                              |
| location     | string    |                              |
| activityIds  | string[]  | refs → activities (future)   |

---

## passengers
Individual travellers — linked to a client and assigned to tours via bookings.

| Field                | Type      | Notes                        |
|----------------------|-----------|------------------------------|
| id                   | auto      |                              |
| firstName            | string    |                              |
| lastName             | string    |                              |
| email                | string    |                              |
| phone                | string    |                              |
| passport             | string    | Passport number              |
| nationality          | string    |                              |
| dob                  | timestamp | Date of birth                |
| dietaryRequirements  | string    |                              |
| medicalNotes         | string    |                              |
| clientId             | string    | ref → clients                |
| createdAt            | timestamp |                              |

---

## bookings
The confirmed link between a passenger and a tour.

| Field        | Type      | Notes                                    |
|--------------|-----------|------------------------------------------|
| id           | auto      |                                          |
| tourId       | string    | ref → tours                              |
| passengerId  | string    | ref → passengers                         |
| clientId     | string    | ref → clients                            |
| status       | string    | pending · confirmed · cancelled          |
| bookedAt     | timestamp |                                          |
| notes        | string    |                                          |

---

## quotes
Quote records generated for clients.

| Field        | Type      | Notes                                              |
|--------------|-----------|----------------------------------------------------|
| id           | auto      |                                                    |
| clientId     | string    | ref → clients                                      |
| tourId       | string    | ref → tours                                        |
| items        | array     | [{description, quantity, unitPrice}]               |
| subtotal     | number    |                                                    |
| tax          | number    |                                                    |
| total        | number    |                                                    |
| currency     | string    |                                                    |
| status       | string    | draft · sent · accepted · declined · expired       |
| validUntil   | timestamp |                                                    |
| notes        | string    |                                                    |
| createdAt    | timestamp |                                                    |
| updatedAt    | timestamp |                                                    |

---

## invoices
Invoice records — typically generated from an accepted quote.

| Field          | Type      | Notes                                              |
|----------------|-----------|----------------------------------------------------|
| id             | auto      |                                                    |
| invoiceNumber  | string    | Human-readable ref (e.g. INV-0001)                 |
| quoteId        | string    | ref → quotes (optional)                            |
| clientId       | string    | ref → clients                                      |
| tourId         | string    | ref → tours                                        |
| items          | array     | [{description, quantity, unitPrice}]               |
| subtotal       | number    |                                                    |
| tax            | number    |                                                    |
| total          | number    |                                                    |
| amountPaid     | number    |                                                    |
| balance        | number    | total − amountPaid                                 |
| currency       | string    |                                                    |
| status         | string    | draft · sent · partial · paid · overdue · cancelled|
| dueDate        | timestamp |                                                    |
| createdAt      | timestamp |                                                    |
| updatedAt      | timestamp |                                                    |

---

## invoices/{invoiceId}/payments (sub-collection — future)
Individual payment instalments against an invoice.

| Field      | Type      | Notes                        |
|------------|-----------|------------------------------|
| id         | auto      |                              |
| amount     | number    |                              |
| method     | string    | cash · card · transfer · other |
| reference  | string    | Payment reference / receipt  |
| paidAt     | timestamp |                              |

---

## providers
Accommodation, transport, activity, and restaurant vendors.

| Field    | Type      | Notes                                              |
|----------|-----------|----------------------------------------------------|
| id       | auto      |                                                    |
| name     | string    |                                                    |
| type     | string    | accommodation · transport · activity · restaurant · other |
| contact  | string    | Contact person name                                |
| email    | string    |                                                    |
| phone    | string    |                                                    |
| address  | string    |                                                    |
| country  | string    |                                                    |
| notes    | string    |                                                    |
| createdAt| timestamp |                                                    |

---

## briefings
Guide and client briefing documents linked to a tour.

| Field      | Type      | Notes                        |
|------------|-----------|------------------------------|
| id         | auto      |                              |
| tourId     | string    | ref → tours                  |
| title      | string    |                              |
| content    | string    | Rich text / markdown         |
| type       | string    | guide · client · internal    |
| createdAt  | timestamp |                              |
| updatedAt  | timestamp |                              |

---

## guides
Tour guide profiles — linked to Firebase Auth UID for guide app login.

| Field           | Type      | Notes                        |
|-----------------|-----------|------------------------------|
| id              | auto      |                              |
| firstName       | string    |                              |
| lastName        | string    |                              |
| email           | string    |                              |
| phone           | string    |                              |
| languages       | string[]  | e.g. ["en", "es", "fr"]      |
| certifications  | string[]  |                              |
| status          | string    | active · inactive            |
| uid             | string    | Firebase Auth UID            |
| createdAt       | timestamp |                              |

---

## documents
Firebase Storage references for generated PDFs.

| Field        | Type      | Notes                                    |
|--------------|-----------|------------------------------------------|
| id           | auto      |                                          |
| type         | string    | quote · invoice · itinerary · briefing   |
| refId        | string    | ID of the source document                |
| tourId       | string    | ref → tours (optional)                   |
| clientId     | string    | ref → clients (optional)                 |
| storageUrl   | string    | Firebase Storage path                    |
| generatedAt  | timestamp |                                          |

---

## Future Collections (design now, build later)

### activities
Optional excursions linked to tours via providers.
Fields: name, tourId, providerId, date, duration, price, capacity, status, notes

### destinations
Reusable destination library to avoid duplicating city/country data.
Fields: name, country, region, description, coordinates, imageUrl

### reviews
Post-tour feedback from passengers.
Fields: tourId, passengerId, rating, comment, submittedAt

### group_threads
Pre-trip passenger communication — the social layer (RAID A07).
Fields: tourId, messages (sub-collection: senderId, text, sentAt)
