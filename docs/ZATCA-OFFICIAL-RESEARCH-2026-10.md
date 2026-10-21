# ZATCA official integration research — 2026-10-05

This note records official-source findings used while planning SHOPNEX invoice printing and ZATCA integration. It is technical orientation, not legal advice, a compliance certificate, or a claim that SHOPNEX is approved by ZATCA.

## Official sources inspected

1. [ZATCA Systems Developers](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx) — the official page showed a last-update date of 10 Aug 2026 and linked the Developer Portal at `https://sandbox.zatca.gov.sa/` plus the technical specifications section.
2. [Technical Requirements & Specifications](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/TechnicalRequirementsSpec.aspx) — official page showed a last-update date of 10 Aug 2026 and linked E-Invoice Specifications and Security Requirements.
3. [Compliance and Enablement Toolbox SDK](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx) — official page says the SDK is for validating e-invoice/credit/debit-note files; its notice says SDK verification alone does not imply ZATCA approval and all integration-phase requirements still apply. Page last update displayed 28 May 2025.
4. [Developer Portal Manual PDF](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/DEVELOPER-PORTAL-MANUAL.pdf) — the fetched version is Version 3, dated 3 Nov 2022. It says the API documentation in the Developer Portal requires login, and its workflow requires compliant XML, CSR/CSID onboarding, and Sandbox testing before use.
5. [E-invoicing Detailed Technical Guideline PDF](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf) — fetched Version 2, Nov 2022. It describes simplified invoices as Reporting within 24 hours and standard invoices as Clearance before delivering the invoice to the buyer.

## Relevant technical points from the official material

- Phase 2 is not merely uploading a PDF or a QR. EGS onboarding/CSID, signed/hash-linked UBL/XML, validation, and a document-type-specific Reporting/Clearance flow are required.
- The Developer Portal Manual describes API calls in the authenticated portal. Its Version 3 FAQ lists `/invoices/reporting/single` for a single simplified document and `/invoices/clearance/single` for a single standard document; it describes a request with `invoiceHash` and Base64 `invoice`, and the `authentication-certificate`/`accept-language` headers. Because this manual is dated 2022 and the API documentation is login-gated, these paths and request details must be re-verified in the taxpayer's current Developer Portal before production use.
- Reporting applies to simplified documents; the seller's cryptographic stamp and QR are part of the reported document. Clearance applies to standard documents, and successful clearance returns the stamped document/QR. Do not treat a local five-tag TLV preview as a Phase 2 document.
- A locally printed invoice/receipt can include a readable QR and a separate Code 128 invoice-number barcode, but printing does not submit or clear/report the invoice.
- ZATCA's public SDK notice explicitly says passing SDK validation is not the same as ZATCA approval.

## Implementation boundary

The public GitHub Pages site is static and must remain a demo-only preview; it has no private backend, taxpayer secrets, or secure submission channel. Never place credentials/CSID/private keys in frontend code, the public repository, or chat. A real authority submission must run through the authenticated local API, use credentials entered locally into the OS credential store, be tested against the official Sandbox/SDK with the taxpayer's EGS, and remain separate from Production until the user has completed official onboarding and explicitly enables that environment.
