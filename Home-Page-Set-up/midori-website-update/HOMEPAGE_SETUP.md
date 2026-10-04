# New Midori homepage: setup

## What's new

| Section | What it does |
|---|---|
| **Navigation** | Turns solid when you scroll, hides when scrolling down and comes back when scrolling up. Animated underline on hover. On phones it's a full-screen menu |
| **Hero** | Full-screen slideshow of **your own portfolio photos** (no stock images), with a slow zoom effect and crossfade. Headline words rise in one by one, the photo moves gently as you scroll, and progress bars show each slide. Tap "Now showing" to open that collection |
| **Service ticker** | A slow scrolling strip: Weddings · Indian & multi-day weddings · Engagements · … (pauses on hover) |
| **Portfolio** | Mosaic grid of your collections, loaded live from your dashboard. Each one fades up into view, and photos zoom on hover. Clicking opens a full-screen gallery: arrow keys, **Escape closes it** (broken on the current site), swipe on phones, photo counter, next collection, and a "Book a session like this" button |
| **Packages** | Tabs for Weddings / Multi-day weddings / Portraits & events, showing **your real prices** from the booking catalog. Each card links straight into booking with that package already selected |
| **How it works** | 5 steps. A line fills and step numbers light up as you scroll |
| **Numbers** | 150+ / 20+ / 5 count up when they come into view |
| **Why Midori** | 4 points, all taken from what your packages actually include |
| **Brands** | Rently, Super 8, Reco, Rajmahal (from your current site) |
| **FAQ** | 8 answers built only from your package guide (prices, delivery times, travel, drone, print release). One answer opens at a time, with a smooth slide |
| **Final call to action** | Large closing message with a soft glow, plus Book / Ask a question buttons |
| **Footer** | Only real links. The fake phone **+1 (555) 123-4567** and the wrong email **hello@midorimedia.com** are gone |
| **SEO** | Better page title, plus business details Google can read (name, Overland Park KS, Kansas & Missouri, price range) |

**Taken out on purpose:**
- The 10 testimonials ("Marcus Johnson, Vogue Studios"…). They read like template text, and fake reviews can get a business into trouble. Add real ones in `siteConfig.js` and the section appears by itself.
- The stock Unsplash photo.

**Animations:**
- They respect visitors who turn on "reduce motion".
- The slideshow pauses when the browser tab is hidden.
- Only the current and next hero photos are loaded.

## Install (5 minutes)

1. Copy two folders into your website project's `src/`:
   - `src/home/`: the new homepage
   - `src/booking/`: the booking pages (updated copy; replace the old one if you already added it)
2. In your routes, use the new page for `/`:
   ```jsx
   import HomePage from "./home/HomePage";
   { path: "/", element: <HomePage /> },
   ```
   The new homepage has its **own** navigation and footer. If your app wraps every page in a shared header and footer, leave them out on `/` so they don't show twice.
3. Delete the old homepage components.
4. No new packages are needed. Build and deploy as usual.

## Change your details: `src/home/siteConfig.js`

- `contact.phone`: add your phone number (it's hidden while empty)
- `social.instagram`, `facebook`, …: your links (hidden while empty)
- `testimonials`: real reviews only
- `stats`: your numbers
- `heroFolders`: which collections play in the hero slideshow (landscape photos look best)
- `folderLabels`: nicer public names, e.g. "Kids Bday" → "Birthdays", "Motels" → "Hospitality", "Marketing" → "Food & Brands"

## Important: photo sizes

Your portfolio images are the **original camera files** (5472×3648 and up, often 5–15 MB each). That's why the current site loads slowly, and it will slow the new one too, especially on phones.

The best fix is to upload web-sized copies, about 2400 px wide at 80% JPEG quality. This change alone usually makes the page several times faster. Until you do, the new page reduces the damage: only 2 hero photos load at a time, and the grid and gallery load photos as they're needed.
