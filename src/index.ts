import { createJWT, verifyJWT } from '@eengineer1/did-jwt'
import { Resolvable } from 'did-resolver'
import _ from 'lodash'
import * as validators from './validators'
import {
  JwtCredentialPayload,
  Issuer,
  JwtPresentationPayload,
  JWT,
  VerifiablePresentation,
  VerifiableCredential,
  CredentialPayload,
  PresentationPayload,
  Verifiable,
  W3CCredential,
  W3CPresentation,
  VerifiedCredential,
  VerifiedPresentation,
  VerifyPresentationOptions,
  CreatePresentationOptions,
  CreateCredentialOptions,
  VerifyCredentialOptions,
  JWT_ALG,
  CredentialPayloadValidationMessage,
} from './types'
import {
  transformCredentialInput,
  transformPresentationInput,
  normalizeCredential,
  normalizePresentation,
  asArray,
  notEmpty,
} from './converters'
export {
  Issuer,
  CredentialPayload,
  PresentationPayload,
  JwtCredentialPayload,
  JwtPresentationPayload,
  VerifiableCredential,
  VerifiablePresentation,
  VerifiedCredential,
  VerifiedPresentation,
  Verifiable,
  W3CCredential,
  W3CPresentation,
  transformCredentialInput,
  transformPresentationInput,
  normalizeCredential,
  normalizePresentation,
}

/**
 * Creates a VerifiableCredential given a `CredentialPayload` or `JwtCredentialPayload` and an `Issuer`.
 *
 * This method transforms the payload into the [JWT encoding](https://www.w3.org/TR/vc-data-model/#jwt-encoding)
 * described in the [W3C VC spec](https://www.w3.org/TR/vc-data-model) and then validated to conform to the minimum spec
 * required spec.
 *
 * The `issuer` is then used to assign an algorithm, override the `iss` field of the payload and then sign the JWT.
 *
 * @param payload `CredentialPayload` or `JwtCredentialPayload`
 * @param issuer `Issuer` the DID, signer and algorithm that will sign the token
 * @return a `Promise` that resolves to the JWT encoded verifiable credential or rejects with `TypeError` if the
 * `payload` is not W3C compliant
 */
export async function createVerifiableCredentialJwt(
  payload: JwtCredentialPayload | CredentialPayload,
  issuer: Issuer,
  options: CreateCredentialOptions = {}
): Promise<JWT> {
  const parsedPayload: JwtCredentialPayload = {
    iat: undefined,
    ...transformCredentialInput(payload, options.removeOriginalFields),
  }
  validateJwtCredentialPayload(parsedPayload)
  return createJWT(
    parsedPayload,
    {
      ...options,
      issuer: issuer.did || parsedPayload.iss || '',
      signer: issuer.signer,
    },
    {
      ...options.header,
      alg: issuer.alg || options.header?.alg || JWT_ALG,
    }
  )
}

/**
 * Creates a VerifiablePresentation JWT given a `PresentationPayload` or `JwtPresentationPayload` and an `Issuer`.
 *
 * This method transforms the payload into the [JWT encoding](https://www.w3.org/TR/vc-data-model/#jwt-encoding)
 * described in the [W3C VC spec](https://www.w3.org/TR/vc-data-model) and then validated to conform to the minimum spec
 * required spec.
 *
 * The `holder` is then used to assign an algorithm, override the `iss` field of the payload and then sign the JWT.
 *
 * @param payload `PresentationPayload` or `JwtPresentationPayload`
 * @param holder `Issuer` of the Presentation JWT (holder of the VC), signer and algorithm that will sign the token
 * @param options `CreatePresentationOptions` allows to pass additional values to the resulting JWT payload
 * @return a `Promise` that resolves to the JWT encoded verifiable presentation or rejects with `TypeError` if the
 * `payload` is not W3C compliant
 */
export async function createVerifiablePresentationJwt(
  payload: JwtPresentationPayload | PresentationPayload,
  holder: Issuer,
  options: CreatePresentationOptions = {}
): Promise<JWT> {
  const parsedPayload: JwtPresentationPayload = {
    iat: undefined,
    ...transformPresentationInput(payload, options?.removeOriginalFields),
  }

  // add challenge to nonce
  if (options.challenge && Object.getOwnPropertyNames(parsedPayload).indexOf('nonce') === -1) {
    parsedPayload.nonce = options.challenge
  }

  // add domain to audience.
  if (options.domain) {
    const audience = [...asArray(options.domain), ...asArray(parsedPayload.aud)].filter(notEmpty)
    parsedPayload.aud = [...new Set(audience)]
  }

  validateJwtPresentationPayload(parsedPayload)
  return createJWT(
    parsedPayload,
    {
      ...options,
      issuer: holder.did || parsedPayload.iss || '',
      signer: holder.signer,
    },
    {
      ...options.header,
      alg: holder.alg || options.header?.alg || JWT_ALG,
    }
  )
}

export function validateJwtCredentialPayload(payload: JwtCredentialPayload): void {
  validators.validateContext(payload.vc['@context'])
  validators.validateVcType(payload.vc.type)
  validators.validateCredentialSubject(payload.vc.credentialSubject)
  if (payload.nbf) validators.validateTimestamp(payload.nbf)
  if (payload.exp) validators.validateTimestamp(payload.exp)
}

export function validateCredentialPayload(payload: CredentialPayload): void {
  validators.validateContext(payload['@context'])
  validators.validateVcType(payload.type)
  validators.validateCredentialSubject(payload.credentialSubject)
  if (payload.issuanceDate) validators.validateTimestamp(payload.issuanceDate)
  if (payload.expirationDate) validators.validateTimestamp(payload.expirationDate)
}

export function validateEqualPayloads(
  payloadJWT: JwtCredentialPayload,
  payload: CredentialPayload
): CredentialPayloadValidationMessage {
  //@context
  if (typeof payloadJWT.vc['@context'] === 'string' && payloadJWT.vc['@context'] !== payload['@context'])
    return { valid: false, message: `invalid_@context: The '@context' fields of type 'string' do not match.` }
  if (
    !Array.isArray(payloadJWT.vc['@context']) ||
    !Array.isArray(payload['@context']) ||
    !payloadJWT.vc['@context'].every((context: string) => payload['@context'].indexOf(context) !== -1) ||
    !payload['@context'].every((context: string) => payloadJWT.vc['@context'].indexOf(context) !== -1)
  )
    return { valid: false, message: `invalid_@context: The '@context' fields of type 'string[]' do not match.` }
  //type
  if (typeof payloadJWT.vc.type === 'string' && payloadJWT.vc.type !== payload.type)
    return { valid: false, message: `invalid_type: The 'type' fields of type 'string' do not match.` }
  if (
    !Array.isArray(payloadJWT.vc.type) ||
    !Array.isArray(payload.type) ||
    !payloadJWT.vc.type.every((type: string) => payload.type.indexOf(type) !== -1) ||
    !payload.type.every((type: string) => payloadJWT.vc.type.indexOf(type) !== -1)
  )
    return { valid: false, message: `invalid_type: The 'type' fields of type 'string[]' do not match.` }
  //issuer
  if (
    payloadJWT?.iss &&
    typeof payloadJWT?.iss === 'string' &&
    typeof payload?.issuer === 'object' &&
    payloadJWT.iss !== payload.issuer.id
  ) {
    console.warn(payloadJWT)
    console.warn(payload)
    return { valid: false, message: `invalid_issuer: The 'issuer' fields of type 'string' do not match.` }
  }
  //credentialSubject
  if (!_.isEqual({ ...payloadJWT.vc.credentialSubject, id: payloadJWT?.sub }, payload.credentialSubject))
    return {
      valid: false,
      message: `invalid_credentialSubject: The 'credentialSubject' fields of type 'string' do not match.`,
    }
  //issuanceDate
  console.warn(payloadJWT)
  console.warn(payload)
  if (
    (payloadJWT?.nbf &&
      typeof payload?.issuanceDate === 'string' &&
      payloadJWT?.nbf !== new Date(payload?.issuanceDate).valueOf() / 1000) ||
    (payloadJWT?.nbf &&
      payload?.issuanceDate instanceof Date &&
      payloadJWT?.nbf !== payload?.issuanceDate.valueOf() / 1000)
  ) {
    console.warn(payloadJWT)
    console.warn(payload)
    return {
      valid: false,
      message: `invalid_issuanceDate: The 'issuanceDate' fields of type '${typeof payload?.issuanceDate}' do not match.`,
    }
  }
  //expirationDate
  if (
    payloadJWT?.exp &&
    (typeof payload?.expirationDate === 'string' || typeof payload?.expirationDate === 'number') &&
    payloadJWT.exp !== new Date(payload?.expirationDate).valueOf() / 1000
  )
    return {
      valid: false,
      message: `invalid_expirationDate: The 'expirationDate' fields of type 'string' do not match.`,
    }
  if (
    payloadJWT?.exp &&
    payload?.expirationDate instanceof Date &&
    payloadJWT.exp !== payload?.expirationDate.valueOf() / 1000
  )
    return {
      valid: false,
      message: `invalid_expirationDate: The 'expirationDate' fields instance of 'Date' do not match.`,
    }

  return { valid: true, message: `` }
}

export function validateJwtPresentationPayload(payload: JwtPresentationPayload): void {
  validators.validateContext(payload.vp['@context'])
  validators.validateVpType(payload.vp.type)
  // empty credential array is allowed
  if (payload.vp.verifiableCredential && payload.vp.verifiableCredential.length >= 1) {
    for (const vc of asArray(payload.vp.verifiableCredential)) {
      if (typeof vc === 'string') {
        validators.validateJwtFormat(vc)
      } else {
        validateCredentialPayload(vc)
      }
    }
  }
  if (payload.exp) validators.validateTimestamp(payload.exp)
}

export function validatePresentationPayload(payload: PresentationPayload): void {
  validators.validateContext(payload['@context'])
  validators.validateVpType(payload.type)
  // empty credential array is allowed
  if (payload.verifiableCredential && payload.verifiableCredential.length >= 1) {
    for (const vc of payload.verifiableCredential) {
      if (typeof vc === 'string') {
        validators.validateJwtFormat(vc)
      } else {
        validateCredentialPayload(vc)
      }
    }
  }
  if (payload.expirationDate) validators.validateTimestamp(payload.expirationDate)
}

/**
 * Verifies and validates a VerifiableCredential that is encoded as a JWT according to the W3C spec.
 *
 * @return a `Promise` that resolves to a `VerifiedCredential` or rejects with `TypeError` if the input is not
 * W3C compliant
 * @param vc the credential to be verified. Currently only the JWT encoding is supported by this library
 * @param resolver a configured `Resolver` (or an implementation of `Resolvable`) that can provide the DID document of the JWT issuer
 */
export async function verifyCredential(
  vc: JWT,
  resolver: Resolvable,
  options: VerifyCredentialOptions = {},
  nonJWTPayload?: CredentialPayload
): Promise<VerifiedCredential> {
  const verified: Partial<VerifiedCredential> = await verifyJWT(vc, { resolver, ...options })
  verified.verifiableCredential = normalizeCredential(verified.jwt as string, options?.removeOriginalFields)
  validateCredentialPayload(verified.verifiableCredential)
  if (options?.validateNonJWTPayload || nonJWTPayload) {
    if (!nonJWTPayload) throw new Error('Non-JWT Payload is not provided while validation is on.')

    validateCredentialPayload(nonJWTPayload)
    const equalPayloads = validateEqualPayloads(
      { ...verified.payload, vc: verified.verifiableCredential },
      nonJWTPayload
    )
    if (!equalPayloads.valid) {
      console.warn(equalPayloads.message)
      throw new Error(`Invalid Credential Payload or the Credential has been tampered with.`)
    }
  }
  return verified as VerifiedCredential
}

/**
 * Verifies that the given JwtPresentationPayload contains the appropriate options from VerifyPresentationOptions
 *
 * @param payload the JwtPresentationPayload to verify against
 * @param options the VerifyPresentationOptions that contain the optional values to verify.
 * @throws {Error} If VerifyPresentationOptions are not satisfied
 */
export function verifyPresentationPayloadOptions(
  payload: JwtPresentationPayload,
  options: VerifyPresentationOptions
): void {
  if (options.challenge && options.challenge !== payload.nonce) {
    throw new Error(`Presentation does not contain the mandatory challenge (JWT: nonce) for : ${options.challenge}`)
  }

  if (options.domain) {
    // aud might be array
    let matchedAudience
    if (payload.aud) {
      const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
      matchedAudience = audArray.find((item) => options.domain === item)
    }

    if (typeof matchedAudience === 'undefined') {
      throw new Error(`Presentation does not contain the mandatory domain (JWT: aud) for : ${options.domain}`)
    }
  }
}

/**
 * Verifies and validates a VerifiablePresentation that is encoded as a JWT according to the W3C spec.
 *
 * @return a `Promise` that resolves to a `VerifiedPresentation` or rejects with `TypeError` if the input is
 * not W3C compliant or the VerifyPresentationOptions are not satisfied.
 * @param presentation the presentation to be verified. Currently only the JWT encoding is supported by this library
 * @param resolver a configured `Resolver` or an implementation of `Resolvable` that can provide the DID document of the JWT issuer (presentation holder)
 * @param options optional verification options that need to be satisfied
 */
export async function verifyPresentation(
  presentation: JWT,
  resolver: Resolvable,
  options: VerifyPresentationOptions = {}
): Promise<VerifiedPresentation> {
  const verified: Partial<VerifiedPresentation> = await verifyJWT(presentation, { resolver, ...options })
  verifyPresentationPayloadOptions(verified.payload as JwtPresentationPayload, options)
  verified.verifiablePresentation = normalizePresentation(verified.jwt as string, options?.removeOriginalFields)
  validatePresentationPayload(verified.verifiablePresentation)
  return verified as VerifiedPresentation
}
