import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_SENDER,
    pass: process.env.PASSWORD_SENDER,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.log("Error Verifying Transporter", error);
  } else {
    console.log("Transporter verified");
  }
});

transporter.on("error", (err) => {
  console.error("Nodemailer Error", err.message);
});

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");


export async function SendEnquiry(req, res) {
  try {
    const {
      projectType,
      projectScope,
      timeline,
      vision,
      name,
      email,
      phone,
      budget,
      additionalDetails,
      packageName,
      packageFeatures,
      selectedAddOns,
      quoteTotal
    } = req.body;

    // 🔴 Basic validation (don’t skip this in real apps)
    if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Name and Email are required" });
    }

    
   

    // ✅ Email content
    const mailOptions = {
      from: `"Midori website" <${process.env.EMAIL_SENDER}>`,
      to: process.env.ENQUIRY_RECIPIENT || "midorimediacompany@gmail.com",
      replyTo: email,
      subject: `New Package Enquiry from ${escapeHtml(name)}`,
      html: `
        <h2>New Midori Package Enquiry</h2>

        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || 'N/A')}</p>

        <hr />

        <p><strong>Project Type:</strong> ${escapeHtml(projectType || 'N/A')}</p>
        <p><strong>Project Scope:</strong> ${escapeHtml(projectScope || 'N/A')}</p>
        <p><strong>Timeline:</strong> ${escapeHtml(timeline || 'N/A')}</p>
        <p><strong>Budget:</strong> ${escapeHtml(budget || 'N/A')}</p>
        <p><strong>Selected Package:</strong> ${escapeHtml(packageName || 'N/A')}</p>
        <p><strong>Package Includes:</strong> ${escapeHtml(packageFeatures || 'N/A')}</p>
        <p><strong>Selected Add-ons:</strong> ${escapeHtml(selectedAddOns || 'None')}</p>
        <p><strong>Quoted Total:</strong> ${escapeHtml(quoteTotal || budget || 'N/A')}</p>

        <hr />

        <p><strong>Vision:</strong></p>
        <p>${escapeHtml(vision || 'N/A')}</p>

        <p><strong>Additional Details:</strong></p>
        <p>${escapeHtml(additionalDetails || 'N/A')}</p>
      `,
    };

    // ✅ Send mail
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: "Enquiry received" });

   

  } catch (error) {
    console.error("Email Error:", error);
    return res.status(500).json({ message: "Failed to send enquiry" });
  }
}
