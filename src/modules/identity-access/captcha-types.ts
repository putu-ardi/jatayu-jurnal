export type CaptchaChallenge = {
  id: string;
  imageUrl: string;
  prompt: string;
  expiresInSeconds: number;
};
