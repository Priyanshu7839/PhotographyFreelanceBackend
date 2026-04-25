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
      additionalDetails
    } = req.body;

    // 🔴 Basic validation (don’t skip this in real apps)
    if (!name || !email) {
      return res.status(400).json({ message: "Name and Email are required" });
    }

    
   

    // ✅ Email content
    const mailOptions = {
      from: `"${name}" <${process.env.EMAIL_SENDER}>`,
      to: "midoriclicks@gmail.com", // your receiving email
      subject: `📸 New Photography Enquiry from ${name}`,
      html: `
        <h2>New Photography Enquiry</h2>

        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'N/A'}</p>

        <hr />

        <p><strong>Project Type:</strong> ${projectType || 'N/A'}</p>
        <p><strong>Project Scope:</strong> ${projectScope || 'N/A'}</p>
        <p><strong>Timeline:</strong> ${timeline || 'N/A'}</p>
        <p><strong>Budget:</strong> ${budget || 'N/A'}</p>

        <hr />

        <p><strong>Vision:</strong></p>
        <p>${vision || 'N/A'}</p>

        <p><strong>Additional Details:</strong></p>
        <p>${additionalDetails || 'N/A'}</p>
      `,
    };

    // ✅ Send mail
   transporter.sendMail(mailOptions)
  .then(() => console.log("Mail sent"))
  .catch(err => console.error("Mail error:", err));

return res.status(200).json({ message: "Enquiry received" });

   

  } catch (error) {
    console.error("Email Error:", error);
    return res.status(500).json({ message: "Failed to send enquiry" });
  }
}