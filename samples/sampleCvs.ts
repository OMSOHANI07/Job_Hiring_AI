// Fictional worked-example CVs. scripts/make-samples.ts renders these into real .docx files in /samples,
// and the unit tests use the same text, so the documents and the tests can't drift apart.
// All people, companies, emails and numbers here are invented.

export interface SampleSection { heading: string; lines: string[] }
export interface SampleCv {
  file: string;
  name: string;
  appliedRole: "PM" | "SPM";
  header: string;
  sections: SampleSection[];
}

export const SAMPLE_ACCEPT_PM: SampleCv = {
  file: "sample_accept_pm.docx",
  name: "Ananya Kulkarni",
  appliedRole: "PM",
  header: "Ananya Kulkarni · ananya.kulkarni.pm@gmail.com · +91 98190 44120 · Mumbai · linkedin.com/in/ananyakulkarni",
  sections: [
    {
      heading: "Summary",
      lines: [
        "Product Manager who spent almost four years inside freight forwarding operations before moving into product. Sole PM at a Series A freight visibility SaaS company, owning tracking and documentation workflows end to end.",
      ],
    },
    {
      heading: "Experience",
      lines: [
        "Product Manager, Trackwell Logistics Technologies (Series A, 60 people), Mumbai | Apr 2023 – Present",
        "— Sole Product Manager; own tracking and documentation workflows and report directly to the CEO.",
        "— Shipped 5 features across shipment tracking and document management.",
        "— Killed 2 features after usage data showed under 5% weekly adoption; redirected the sprint to a document-exception inbox used by 70% of accounts within 30 days.",
        "— Ran on-site discovery at 6 forwarder offices; a finding on manual carrier confirmations led to a pivot that cut support tickets 45%.",
        "— Own sprint planning and the quarterly roadmap that engineering works from.",
        "— Wrote and ran the post-mortem after a 3-hour tracking outage and closed every action item.",
        "",
        "Operations & Documentation Executive → Senior Executive, Konkan Cargo Movers Pvt Ltd (freight forwarder), Mumbai | Aug 2019 – Mar 2023",
        "— Prepared Bills of Lading, shipping bills and certificates of origin for 150+ shipments a month.",
        "— Coordinated shipping lines and the CHA on bookings, cut-offs and customs filings; managed shipment exceptions.",
        "— Resolved a customs hold overnight before a vessel cut-off, getting the container loaded on time.",
        "— Built a shipment status tracker in Google Sheets after finding the team had no single view of 300 live shipments; adopted by 3 branch teams within a month and still in use.",
      ],
    },
    { heading: "Education", lines: ["B.E. Mechanical Engineering, 2019"] },
    { heading: "Certifications & Tools", lines: ["Jira, SQL, Mixpanel, CargoWise (working knowledge)"] },
  ],
};

export const SAMPLE_REJECT_PM: SampleCv = {
  file: "sample_reject_pm.docx",
  name: "Karan Malhotra",
  appliedRole: "PM",
  header:
    "Karan Malhotra · karan.malhotra.product@gmail.com · +91 99001 23456 · Bengaluru · github.com/karanm · CSPO · Reforge 2024 · Speaker, ProductCon",
  sections: [
    {
      heading: "Summary",
      lines: [
        "Certified Scrum Product Owner with five years in consumer fintech product management. Skilled in JTBD, RICE prioritisation, OKRs, Agile/Scrum and North Star metrics.",
      ],
    },
    {
      heading: "Experience",
      lines: [
        "Product Manager, PayNova (consumer fintech app, 2,500 employees), Bengaluru | Jun 2021 – Present",
        "— Part of the payments squad on a 9-person PM team.",
        "— Worked with senior PMs and a Group PM who set the roadmap to improve checkout conversion 6% on the established payments product.",
        "— Wrote PRDs and handed them to engineering for delivery.",
        "— Used JTBD, RICE, OKRs, Agile/Scrum and North Star frameworks to structure the squad's work.",
        "",
        "Associate Product Manager, PayNova, Bengaluru | Jul 2019 – May 2021",
        "— Supported senior PMs on the wallet and rewards features.",
        "— Assisted with sprint ceremonies and backlog grooming.",
      ],
    },
    { heading: "Education", lines: ["B.Tech Computer Science, 2019"] },
    {
      heading: "Certifications & Tools",
      lines: ["Certified Scrum Product Owner (CSPO), Reforge Product Strategy 2024, Speaker at ProductCon 2023", "Jira, Confluence, Amplitude, Figma"],
    },
  ],
};

export const SAMPLES = [SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM];

/** Plain-text rendering, matching what mammoth extracts from the generated DOCX. */
export function sampleText(cv: SampleCv): string {
  return [cv.header, ...cv.sections.flatMap((s) => [s.heading, ...s.lines])].join("\n");
}
