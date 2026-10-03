# Midori booking: one-time setup

Everything here is built from your **Midori Package Guide (Oct 1, 2026)**: 5 wedding packages, 3 multi-event wedding options plus Legacy, 5 small-event packages, every add-on, extra-hour rate and delivery time. The guide's internal appendix (costs, competitors) is **not** on the website.

## What clients get

1. **Service**: Weddings · Indian & multi-event weddings · Portraits & small events
2. **Package**: cards with price, hours, team, photos and film; "See everything included"; a side-by-side comparison for weddings; for small events, choosing an occasion (Birthday, Proposal, …) highlights the packages that fit it
3. **Customize**: extra hours at the package's rate; only add-ons that are valid for that package can be picked. Included items are shown as included. Drone needs "Outdoor event". Rush is +25%
4. **Event**: date (and last day for multi-day), time, venue, city, guests, notes
5. **Contact**: name, email, phone, preferred contact, how they heard about you
6. **Review and send**: nothing is charged; they confirm it's a request
7. **Confirmation**: reference number (e.g. `MID-7SP9KS`), confirmation email, and your Calendly scheduler embedded with their name and email filled in

The live total updates as they choose. The **server recalculates every price**, so nobody can change the price in their browser. Progress is saved if they leave and come back. On phones, the total and Continue button stay at the bottom of the screen.

You get an email for each request, and a **Bookings** page in your dashboard. There you can filter by status (New, Contacted, Call booked, Confirmed, Declined, Cancelled), search, open a request, change its status and keep private notes. When a client books a call in Calendly, the request moves to **Call booked** on its own.

## Step 1: Database (Supabase, 1 minute)

Supabase → SQL Editor → paste `supabase/migrations/20261003_booking_requests.sql` → Run.
It only **adds** a `booking_requests` table and doesn't touch existing data. You can safely run it more than once.

## Step 2: Backend (Render)

1. Replace your backend code with the files in `backend/`. This includes the booking feature and the security fixes listed below.
2. In Render → your service → **Environment**, add these:

| Variable | Value |
|---|---|
| `CALENDLY_URL` | Your public Calendly event link, e.g. `https://calendly.com/yourname/consultation` (see Step 4) |
| `BOOKING_NOTIFY_EMAIL` | Where new-booking alerts go (default `midorimediacompany@gmail.com`) |
| `ADMIN_BOOKINGS_URL` | `https://midorimediacompany.com/dashboard/bookings` |
| `TRUST_PROXY_HOPS` | `1` |
| `ZOOM_MEETING_URL` | Optional. See the Zoom note in Step 4 |
| `CALENDLY_API_TOKEN` | Optional. Calendly → Integrations → API & Webhooks → Personal access token. Shows the call time in your dashboard |

`EMAIL_SENDER` and `PASSWORD_SENDER` (a Gmail App Password) are the ones you already use.

3. Deploy. Check it's working by opening `https://photographyfreelancebackend.onrender.com/booking/catalog`. It should show your packages.
4. Your **second** backend (`photographyfreelancebackend-8p6u`) uses the same live database. Deploy the same code there too, or shut it down. Otherwise the old security holes stay open on it.

## Step 3: Website (React)

Copy the folder `frontend/src/booking/` into your website project at `src/booking/`. It needs no new packages.

Add the routes where your other routes are (you use React Router):

```jsx
import BookingFlow from "./booking/BookingFlow";
import BookingsAdmin from "./booking/BookingsAdmin";

{ path: "/booking", element: <BookingFlow /> },
{ path: "/wedding-builder", element: <Navigate to="/booking" replace /> },   // old builder has old prices
{ path: "/dashboard/bookings", element: <BookingsAdmin /> },                  // put it inside your admin-only area
```

Then:
- Point **Build Your Package**, **Book a Shoot** and **Start Your Project** to `/booking`.
- Add a **Bookings** link in your dashboard menu → `/dashboard/bookings`.
- To link straight to a package, use links like `/booking?package=signature` or `/booking?category=small_event`.
- Delete the old `/wedding-builder` and old `/booking` page components. They show the old prices ($1,800 / $1,200 / $600).
- Optional: set `VITE_API_URL` to point the booking pages at a different backend, for example your test one.

The pages use your existing theme colors (`--accent`, `--background`, …), so they match the site.

## Step 4: Calendly and Zoom (your part, 5 minutes)

1. **Fix Calendly's calendar connection first.** When I opened your Calendly it showed **"Calendar connection error"** for midorimediaglobal@gmail.com, and it sends every page to Calendar settings. Click **Reconnect**. Until you do, Calendly can't see when you're busy and can double-book you.
2. Create an event type, e.g. **"Consultation call · 20 min"**.
3. In that event's **Location**, choose **Zoom** and connect your Zoom account. Calendly then creates a **separate Zoom link for each call** and puts it in the invite.
   - Your personal meeting link (with the password in it) is the same room for everyone. If it's on the website or in emails, any past client could join a later call. Use Calendly's Zoom integration instead, and leave `ZOOM_MEETING_URL` empty.
   - Note: the Zoom chat link you sent belongs to **saitejadevops850@gmail.com**, not a Midori account. Connect the business Zoom account.
4. Copy the event's public link (Share → Copy link) into `CALENDLY_URL` on Render.
5. Optional: add a question "Booking reference" to the event as question 1. The website fills it in with the client's `MID-…` reference.

## Step 5: Check it works

1. Open `/booking`, choose Essential, add the engagement session. The total should read **$2,950**.
2. Send a request with your own email. You should get two emails (the client copy and the alert).
3. Open `/dashboard/bookings`. The request is there as **New**.
4. Book a call in the scheduler on the confirmation page. The request changes to **Call booked**.

## Security fixes included in this backend

| Problem (from the test report) | Fix |
|---|---|
| Any logged-in user (even a client) could create an **admin** account | `/client/addmembers` is admin-only. Roles are checked (only a superadmin can add a superadmin). Passwords are hashed and must be at least 10 characters |
| New staff passwords were saved as plain text | Now hashed with bcrypt |
| Password hashes were sent to the browser | Every response has `password`/`password_hash` removed |
| `getpreviewurl` let anyone download any client's photos | Route removed (your site never used it) |
| Clients and team members could add invoice items | Admin-only, with checks on quantity and rate |
| Deactivated staff could still log in or use old logins | Blocked |
| Login limit was shared by everyone on Render (one IP) and counted logouts | Uses the real visitor IP, and only counts failed logins |
| Login failed if the email had a capital letter | Email matching ignores capitals |
| Resetting the password of a client that doesn't exist said "success" | Returns 404 |
| `page=-5` crashed with 500; `limit` had no maximum | Page clamped to 1 or more, limit to 50 or fewer |
| Broken routes `savetoDb`, `selectImage`, legacy `createClient` | Removed (unused) |
| Express HTML error pages | JSON errors (404 / 400 bad JSON / 403 CORS) |
| `.env` not in `.gitignore` | Added. **Rotate** your Supabase service key, R2 keys, JWT secret and Gmail app password, because they were in the zip you shared |

Still to do on your side:
- Delete `qa_backup.password_backup_20261003` (25 plain-text passwords).
- Change the weak passwords (`123456`, `Name@1234`).
- Remove the test accounts (`aman@example.com`, `qa_admin@example.com`, and the qa/test members and clients).

## Decisions taken (change any time in `booking/catalog.js`)

- **No online payment.** The client sends a request, books a call, then you send the contract and deposit. Your guide says deposit, travel and tax policy aren't decided yet (Part 5).
- **Travel** is shown as a note ("may apply outside the Kansas City area"), not calculated.
- **Rush (+25%)** is a small-event extra only, as in the guide. It's 25% of the package, extra hours and editing extras. Live streams aren't included in the 25%.
- **Album** add-on is $600 "from", minus the $500 credit for Premier and the bundles built on Premier, so it shows +$100. Legacy includes it.
- **Multi-event bundles** ($9,400 / $11,900): extra hours use the Premier rate ($350). The guide doesn't give one for bundles.
- **Full event video / RAW clips on Mini Moment** require the Highlight video add-on, because they need a videographer.

To change a price: edit `backend/booking/catalog.js`, copy it to `src/booking/catalog.js` on the website, and deploy both. The server always uses its own copy for the real price.

## Tests

- `npm test` (backend): 10 pricing tests check every number from your guide.
- `node booking/booking.e2e.mjs`: 34 API tests. Run it against a **test** database only.
