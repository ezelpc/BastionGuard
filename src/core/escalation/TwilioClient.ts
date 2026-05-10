import twilio from "twilio";

export class TwilioClient {
  private client: twilio.Twilio | null = null;
  private fromNumber: string | null = null;

  public constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER ?? null;

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    }
  }

  public async makeCall(toNumber: string, message: string): Promise<boolean> {
    if (!this.client || !this.fromNumber) {
      console.warn(`\n[TWILIO] Simulando llamada a ${toNumber} (Credenciales no configuradas)`);
      console.warn(`[VOZ]: "${message}"`);
      return true;
    }

    try {
      // Use TwiML to convert text to speech
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say(
        { voice: "Polly.Lucia", language: "es-ES" },
        message
      );

      const call = await this.client.calls.create({
        twiml: twiml.toString(),
        to: toNumber,
        from: this.fromNumber,
      });

      console.log(`[TWILIO] Llamada iniciada exitosamente a ${toNumber}. SID: ${call.sid}`);
      return true;
    } catch (err) {
      console.error(`[TWILIO] Error realizando llamada a ${toNumber}:`, err);
      return false;
    }
  }
}
