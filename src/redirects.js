import { getConfig } from 'src/config'
import AuthAction from 'src/AuthAction'

/**
 * redirectUnauthenticatedUser redirects unauthenticated user to the auth page specified
 * in the config or in the configuration of `withAuthUserTokenSSR`
 *
 * @param {Object} redirectSettings
 */
export function redirectUnauthenticatedUser(
  unauthenticatedRedirectURL,
  ctx,
  AuthUser
) {
  if (!unauthenticatedRedirectURL) {
    throw new Error(
      `When "whenUnauthed" is set to AuthAction.REDIRECT_TO_LOGIN, "authPageURL" must be set.`
    )
  }
  const destination =
    typeof unauthenticatedRedirectURL === 'string'
      ? unauthenticatedRedirectURL
      : unauthenticatedRedirectURL({ ctx, AuthUser })

  if (!destination) {
    throw new Error(
      'The "authPageURL" must be set to a non-empty string or resolve to a non-empty string'
    )
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  }
}

/**
 * redirectAuthenticatedUser.
 *
 * @param {} redirectSettings
 */
export function redirectAuthenticatedUser(
  authenticatedRedirectURL,
  ctx,
  AuthUser
) {
  if (!authenticatedRedirectURL) {
    throw new Error(
      `When "whenAuthed" is set to AuthAction.REDIRECT_TO_APP, "appPageURL" must be set.`
    )
  }
  const destination =
    typeof authenticatedRedirectURL === 'string'
      ? authenticatedRedirectURL
      : authenticatedRedirectURL({ ctx, AuthUser })

  if (!destination) {
    throw new Error(
      'The "appPageURL" must be set to a non-empty string or resolve to a non-empty string'
    )
  }
  return {
    redirect: {
      destination,
      permanent: false,
    },
  }
}

/**
 * Generates a process that locates a redirect for a configuration that matches
 * the schema for authenticated and unauthenticated users
 *
 * @generator
 * @function findLegacyRedirect
 * @param {Object} redirectSettings
 * @yields {boolean} whether or not the function will continue to process the legacy configuration on the next iteration
 * @returns {Object | null} redirect config or null
 */
function* findLegacyRedirect({
  authPageURL,
  whenUnauthed,
  whenAuthed,
  appPageURL,
  AuthUser,
  ctx,
}) {
  const unauthenticatedRedirectURL = authPageURL || getConfig().authPageURL // by default, unauthed go to authPageURL
  const shouldRedirectUnauthedUser =
    !AuthUser.id && whenUnauthed === AuthAction.REDIRECT_TO_LOGIN
  const authenticatedRedirectURL = appPageURL || getConfig().appPageURL // by default, authed go to appPageURL
  const shouldRedirectAuthedUser =
    AuthUser.id && whenAuthed === AuthAction.REDIRECT_TO_APP

  // yields back to the caller whether or not it will perform
  // any operations on the next iteration
  yield unauthenticatedRedirectURL || authenticatedRedirectURL

  // If specified, redirect to the login page if the user is unauthed.
  if (shouldRedirectUnauthedUser)
    return redirectUnauthenticatedUser(
      unauthenticatedRedirectURL,
      ctx,
      AuthUser
    )

  // If specified, redirect to the app page if the user is authed.
  if (shouldRedirectAuthedUser)
    return redirectAuthenticatedUser(authenticatedRedirectURL, ctx, AuthUser)

  return null
}

/**
 * findRedirectRule.
 *
 * @param {}
 */
function findRedirectRule({ AuthUser, redirectConfig }) {
  const config = redirectConfig || getConfig().redirectConfig
  if (!config) return null

  const redirect = AuthUser.id
    ? config.authenticatedUser
    : config.unauthenticatedUser

  return { redirect }
}

/**
 * processRedirect.
 *
 * @param {} redirectSettings
 */
export function processRedirect(redirectSettings) {
  const legacyRedirect = findLegacyRedirect(redirectSettings)
  const { value: useLegacyRedirect } = legacyRedirect.next()

  if (!useLegacyRedirect) {
    return findRedirectRule(redirectSettings)
  }

  const { value: redirect } = legacyRedirect.next()
  return redirect
}
