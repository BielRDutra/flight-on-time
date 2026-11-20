import { OAuth2Client } from 'google-auth-library';
import {
  GoogleTokenVerificationError,
  type GoogleIdTokenVerifier,
  type GoogleTokenClaims,
} from './google-auth-service.js';

export class GoogleOAuthIdTokenVerifier implements GoogleIdTokenVerifier {
  constructor(private readonly client = new OAuth2Client()) {}

  async verifyIdToken(token: string, audiences: readonly string[]): Promise<GoogleTokenClaims> {
    if (audiences.length === 0) {
      throw new GoogleTokenVerificationError();
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        audience: [...audiences],
      });
      const payload = ticket.getPayload();

      if (!payload?.iss || !payload.sub || !payload.aud || !payload.exp) {
        throw new GoogleTokenVerificationError();
      }

      const claims: GoogleTokenClaims = {
        issuer: payload.iss,
        subject: payload.sub,
        audience: payload.aud,
        expiresAt: payload.exp,
      };

      if (payload.nonce) {
        claims.nonce = payload.nonce;
      }

      return claims;
    } catch (error) {
      if (error instanceof GoogleTokenVerificationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new GoogleTokenVerificationError({ cause: error });
      }

      throw error;
    }
  }
}
