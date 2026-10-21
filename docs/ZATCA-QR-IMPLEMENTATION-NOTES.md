# ملاحظات تنفيذ QR زاتكا وحدود الادعاء

## مراجع رسمية تمت مراجعتها

- [دليل زاتكا لإنشاء QR متوافق مع فاتورة](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/QRCodeCreation.pdf) — يشرح TLV ثنائيًا بترميز UTF-8 ثم Base64، والحقول الأساسية 1–5.
- [دليل الفوترة التفصيلي من زاتكا](https://zatca.gov.sa/en/e-invoicing/introduction/guidelines/documents/e-invoicing_detailed__guideline.pdf) — يفرق بين الفاتورة المبسطة والضريبية في مرحلة الربط: المبسطة تحتاج 9 وسوم TLV في Phase 2، وXML مختومًا بـCSID، والإبلاغ خلال 24 ساعة؛ القياسية تخضع لمسار Clearance ويعيد النظام QR والختم.
- [الدليل الفني التفصيلي](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf) — يحدد TLV/Base64 ووسوم 1–9، ويذكر حدًا أقصى 700 محرف في المستند المستخرج.
- [صفحة SDK الرسمية](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx) — تقول إن الامتثال لا يُثبت إلا بالتحقق من SDK واستيفاء متطلبات مرحلة الربط، وتؤكد أن نجاح الأداة لا يعني اعتماد زاتكا.

## حقول TLV

الوسوم الأساسية: 1 اسم البائع، 2 رقم تسجيل VAT، 3 توقيت إصدار الفاتورة، 4 الإجمالي شامل VAT، 5 مبلغ VAT. كل وسم هو tag بطول بايت واحد، ثم length بطول بايت واحد محسوب من بايتات UTF-8، ثم value؛ لا توجد فواصل أو مسافات بين المقاطع، ويُحوّل تسلسل البايتات إلى Base64 لبيانات QR.

وسوم Phase 2 الإضافية هي: 6 hash للـXML، 7 توقيع ECDSA، 8 المفتاح العام، و9 توقيع شهادة المفتاح العام من CA الفني لزاتكا للفاتورة المبسطة ومذكراتها المرتبطة. لا يجوز توليدها بقيم شكلية أو ثابتة.

## نطاق هذه الدفعة

مولد Phase 1 محلي لا يرسل بيانات إلى زاتكا ولا يتصل بـFATOORA. لا يمثل جاهزية Phase 2 أو اعتمادًا أو صلاحية إصدار فاتورة نظامية. قبل التشغيل الفعلي، يلزم تطبيق أحدث المواصفات، onboarding/CSID، توليد XML/التوقيع، وتشغيل SDK الرسمي وSandbox لمسار المنشأة والحصول على الاستجابة المناسبة.
