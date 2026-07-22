import "server-only";

import {
  ClientSecretPost,
  discovery,
  type Configuration,
} from "openid-client";
import { getServerEnvironment } from "@/lib/env";

export type GoogleOidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  hostedDomain: string;
  redirectUri: string;
  linkRedirectUri: string;
  schoolCode: string;
};

let configurationPromise: Promise<Configuration> | undefined;

export function isGoogleOidcEnabled() {
  return getServerEnvironment().GOOGLE_OIDC_ENABLED;
}

export function requireGoogleOidcSettings(): GoogleOidcSettings {
  const environment = getServerEnvironment();
  if (
    !environment.GOOGLE_OIDC_ENABLED ||
    !environment.GOOGLE_OIDC_ISSUER ||
    !environment.GOOGLE_OIDC_CLIENT_ID ||
    !environment.GOOGLE_OIDC_CLIENT_SECRET ||
    !environment.GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN ||
    !environment.GOOGLE_OIDC_REDIRECT_URI ||
    !environment.GOOGLE_OIDC_LINK_REDIRECT_URI ||
    !environment.GOOGLE_OIDC_SCHOOL_CODE
  ) {
    throw new Error("Google Workspace OIDC is not enabled.");
  }

  return {
    issuer: environment.GOOGLE_OIDC_ISSUER,
    clientId: environment.GOOGLE_OIDC_CLIENT_ID,
    clientSecret: environment.GOOGLE_OIDC_CLIENT_SECRET,
    hostedDomain: environment.GOOGLE_OIDC_ALLOWED_HOSTED_DOMAIN,
    redirectUri: environment.GOOGLE_OIDC_REDIRECT_URI,
    linkRedirectUri: environment.GOOGLE_OIDC_LINK_REDIRECT_URI,
    schoolCode: environment.GOOGLE_OIDC_SCHOOL_CODE,
  };
}

export function getGoogleOidcProviderConfiguration() {
  if (!configurationPromise) {
    const settings = requireGoogleOidcSettings();
    configurationPromise = discovery(
      new URL(settings.issuer),
      settings.clientId,
      {
        redirect_uris: [settings.redirectUri, settings.linkRedirectUri],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
      },
      ClientSecretPost(settings.clientSecret),
      { timeout: 5 },
    ).catch((error: unknown) => {
      configurationPromise = undefined;
      throw error;
    });
  }

  return configurationPromise;
}

export function resetGoogleOidcConfigurationForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("OIDC configuration can only be reset while testing.");
  }
  configurationPromise = undefined;
}
