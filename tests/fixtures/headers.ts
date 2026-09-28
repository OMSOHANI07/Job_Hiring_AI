// Eight CV header styles modelled on the case's past-hire CVs. All values are fictional.
// Each fixture lists the PII values that must be gone after redaction and the text that must survive.

export interface HeaderFixture {
  id: string;
  style: string;
  name: string;
  text: string;
  mustRemove: string[];
  mustKeep: string[];
  expectLocation: "mumbai" | "willing_to_relocate" | "explicitly_unwilling" | "not_stated";
}

const BODY = `Summary
Operations executive turned product manager.
Experience
Operations Executive, Seabridge Forwarders, Mumbai | Jan 2019 – Mar 2022
— Coordinated carriers for 200 shipments a month during 2019–2022 and cut dwell time 18%.
— Managed a ₹2.4Cr monthly freight book; CGPA 8.7/10; grew adoption 35% in Q3 2021.
Education
B.Com, 2018`;

export const HEADER_FIXTURES: HeaderFixture[] = [
  {
    id: "h1", style: "Name | email | phone | City",
    name: "Sneha Pillai",
    text: `Sneha Pillai | sneha.pillai88@gmail.com | +91 98204 37810 | Mumbai\n${BODY}`,
    mustRemove: ["Sneha", "Pillai", "sneha.pillai88@gmail.com", "98204 37810"],
    mustKeep: ["Seabridge Forwarders, Mumbai", "2019–2022", "₹2.4Cr", "8.7/10", "35%", "200 shipments"],
    expectLocation: "mumbai",
  },
  {
    id: "h2", style: "name · email · phone · City",
    name: "Farhan Qureshi",
    text: `Farhan Qureshi · farhanq.ops@outlook.com · 98333-12094 · Pune\n${BODY}`,
    mustRemove: ["Farhan", "Qureshi", "farhanq.ops@outlook.com", "98333-12094", "Pune"],
    mustKeep: ["Seabridge Forwarders, Mumbai", "₹2.4Cr"],
    expectLocation: "not_stated",
  },
  {
    id: "h3", style: "two-column table header (mammoth emits one paragraph per cell)",
    name: "Meera Venkatesh",
    text: `Meera Venkatesh\nmeera.v@protonmail.com\n+91-9845012345\nBengaluru, Karnataka\nlinkedin.com/in/meera-venkatesh\n${BODY}`,
    mustRemove: ["Meera", "Venkatesh", "meera.v@protonmail.com", "9845012345", "Bengaluru", "Karnataka", "linkedin.com/in/meera-venkatesh"],
    mustKeep: ["Seabridge Forwarders, Mumbai"],
    expectLocation: "not_stated",
  },
  {
    id: "h4", style: "header with GitHub and LeetCode links",
    name: "Aditya Raghavan",
    text: `ADITYA RAGHAVAN\naditya.r.dev@gmail.com | 0 98765 43210 | github.com/adityar | leetcode.com/u/aditya_r | Hyderabad\n${BODY}`,
    mustRemove: ["ADITYA", "RAGHAVAN", "aditya.r.dev@gmail.com", "98765 43210", "github.com/adityar", "leetcode.com/u/aditya_r", "Hyderabad"],
    mustKeep: ["Seabridge Forwarders, Mumbai", "B.Com"],
    expectLocation: "not_stated",
  },
  {
    id: "h5", style: "labelled contact line",
    name: "Priya Nair",
    text: `Priya Nair\nEmail: priya.nair.work@yahoo.co.in | Mobile: +91 70211 98765 | Location: Navi Mumbai\nhttps://priyanair.dev/portfolio\n${BODY}`,
    mustRemove: ["Priya", "Nair", "priya.nair.work@yahoo.co.in", "70211 98765", "Navi Mumbai", "priyanair.dev"],
    mustKeep: ["Seabridge Forwarders, Mumbai"],
    expectLocation: "mumbai",
  },
  {
    id: "h6", style: "ALL-CAPS name, landline, street address with PIN",
    name: "Rakesh Deshpande",
    text: `RAKESH DESHPANDE\nFlat 12, Shanti Nagar CHS, Andheri West, Mumbai 400058\nTel: (022) 2345 6789 · rakesh.deshpande@rediffmail.com\n${BODY}`,
    mustRemove: ["RAKESH", "DESHPANDE", "Shanti Nagar", "400058", "2345 6789", "rakesh.deshpande@rediffmail.com"],
    mustKeep: ["Seabridge Forwarders, Mumbai"],
    expectLocation: "mumbai",
  },
  {
    id: "h7", style: "City-first contact line + Personal Details block",
    name: "Kavya Iyengar",
    text: `Kavya Iyengar\nChennai, Tamil Nadu | +91 9123456789 | kavya.iyengar@gmail.com\n${BODY}\nPersonal Details\nDate of Birth: 14/02/1996\nGender: Female\nMarital Status: Single\nNationality: Indian\nFather's Name: S. Iyengar\nPAN: ABCPI1234K\nAadhaar: 1234 5678 9012\nAddress: 22, 3rd Cross, Adyar, Chennai 600020\nOpen to relocation to Mumbai.`,
    mustRemove: ["Kavya", "Iyengar", "9123456789", "kavya.iyengar@gmail.com", "Chennai", "14/02/1996", "Female", "Single", "ABCPI1234K", "1234 5678 9012", "Adyar", "600020"],
    mustKeep: ["Seabridge Forwarders, Mumbai", "Open to relocation to Mumbai."],
    expectLocation: "willing_to_relocate",
  },
  {
    id: "h8", style: "international phone, WhatsApp and social links, remote-only preference",
    name: "Zoya Mirza",
    text: `Zoya Mirza — Product Manager\n+971 50 123 4567 · wa.me/971501234567 · zoya@zoyamirza.me · behance.net/zoyam · x.com/zoyabuilds · @zoyabuilds · Dubai\nLooking for remote-only roles.\n${BODY}`,
    mustRemove: ["Zoya", "Mirza", "+971 50 123 4567", "wa.me/971501234567", "zoya@zoyamirza.me", "behance.net/zoyam", "x.com/zoyabuilds", "@zoyabuilds", "Dubai"],
    mustKeep: ["Seabridge Forwarders, Mumbai", "Product Manager"],
    expectLocation: "explicitly_unwilling",
  },
];
