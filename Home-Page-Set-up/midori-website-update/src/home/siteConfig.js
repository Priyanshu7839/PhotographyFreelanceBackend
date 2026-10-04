// Everything on the homepage that is about YOUR business lives here.
// Empty values are hidden automatically, so nothing fake ever shows on the site.

const siteConfig = {
  brand: "Midori Media",
  legalName: "Midori Media Company LLC",
  tagline: "Photo & film studio",
  location: "Overland Park, Kansas",
  serviceArea: "Kansas & Missouri",

  contact: {
    email: "midorimediacompany@gmail.com", // where enquiries already go
    phone: "", // e.g. "+1 (913) 555-0123" (leave empty to hide)
  },

  social: {
    instagram: "", // e.g. "https://instagram.com/midoriclicks"
    facebook: "",
    youtube: "",
    tiktok: "",
    linkedin: "",
  },

  // Shown with a count-up animation. These are the numbers from your current site; update any time.
  stats: [
    { value: 150, suffix: "+", label: "Projects delivered" },
    { value: 20, suffix: "+", label: "Cities" },
    { value: 5, suffix: "", label: "Countries" },
  ],

  // Brands you have worked with (from your current site). Add `logo` (an imported image) to show a logo instead of the name.
  partners: [
    { name: "Rently", logo: "" },
    { name: "Super 8", logo: "" },
    { name: "Reco", logo: "" },
    { name: "Rajmahal", logo: "" },
  ],

  // Real client reviews only. The section stays hidden until you add at least one.
  // Example: { quote: "…", name: "Ananya & Rohit", event: "Wedding, Overland Park" }
  testimonials: [],

  // Portfolio folders to feature first in the hero slideshow (names exactly as in your dashboard).
  // Landscape photos look best. Leave empty to use the first folders.
  heroFolders: ["Modelling", "Graduation", "Kids Bday", "Classical Dance", "HouseWarming"],

  // Optional: rename folders for visitors without renaming them in the database.
  folderLabels: {
    "Kids Bday": "Birthdays",
    HouseWarming: "Housewarming",
    Motels: "Hospitality",
    Marketing: "Food & Brands",
  },
};

export default siteConfig;
