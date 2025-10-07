export interface BearerToken {
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": string[]; // user or admin
    "x-hasura-default-role": string; // user or admin
    "x-hasura-user-id": string; // For example google-oauth2|117378660557688339025
  };
  iss: string;
  sub: string; // For example google-oauth2|117378660557688339025
  aud: string[];
  iat: number;
  exp: number;
  scope: string;
  azp: string;
}
