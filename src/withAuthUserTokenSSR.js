import createAuthUser from 'src/createAuthUser'
import { getCookie } from 'src/cookies'
import { verifyIdToken } from 'src/firebaseAdmin'
import {
  getAuthUserCookieName,
  getAuthUserTokensCookieName,
} from 'src/authCookies'
import { getConfig } from 'src/config'
import AuthAction from 'src/AuthAction'

/**
 * determineAuthUser gets the user from either the ID token using AuthUser.getIdToken
 * or by creating the auth user in unauthenticated user scenarios
 *
 * @param {Object} redirectSettings
 */
const determineAuthUser = async ({
  useToken,
  res,
  req,
  keys,
  secure,
  signed,
}) => {
  // Get the user either from:
  // * the ID token, refreshing the token as needed (via a network
  //   request), which will make `AuthUser.getIdToken` resolve to
  //   a valid ID token value
  // * the "AuthUser" cookie (no network request), which will make
  //  `AuthUser.getIdToken` resolve to null
  if (useToken) {
    // Get the user's ID token from a cookie, verify it (refreshing
    // as needed), and return the serialized AuthUser in props.
    const cookieValStr = getCookie(
      getAuthUserTokensCookieName(),
      {
        req,
        res,
      },
      { keys, secure, signed }
    )
    const { idToken, refreshToken } = cookieValStr
      ? JSON.parse(cookieValStr)
      : {}
    if (idToken) {
      return verifyIdToken(idToken, refreshToken)
    }
    return createAuthUser() // unauthenticated AuthUser
  }
  // Get the user's info from a cookie, verify it (refreshing
  // as needed), and return the serialized AuthUser in props.
  const cookieValStr = getCookie(
    getAuthUserCookieName(),
    {
      req,
      res,
    },
    { keys, secure, signed }
  )
  return createAuthUser({
    serializedAuthUser: cookieValStr,
  })
}

/**
 * redirectUnauthenticatedUser redirects unauthenticated user to the auth page specified
 * in the config or in the configuration of `withAuthUserTokenSSR`
 *
 * @param {Object} redirectSettings
 */
const redirectUnauthenticatedUser = (
  unauthenticatedRedirectURL,
  ctx,
  AuthUser
) => {
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
const redirectAuthenticatedUser = (authenticatedRedirectURL, ctx, AuthUser) => {
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
 * findLegacyRedirect.
 *
 * @param {} redirectSettings
 */
const findLegacyRedirect = ({
  authPageURL,
  whenUnauthed,
  whenAuthed,
  appPageURL,
  AuthUser,
  ctx,
}) => {
  const unauthenticatedRedirectURL = authPageURL || getConfig().authPageURL // by default, unauthed go to authPageURL
  const shouldRedirectUnauthedUser =
    !AuthUser.id && whenUnauthed === AuthAction.REDIRECT_TO_LOGIN
  const authenticatedRedirectURL = appPageURL || getConfig().appPageURL // by default, authed go to appPageURL
  const shouldRedirectAuthedUser =
    AuthUser.id && whenAuthed === AuthAction.REDIRECT_TO_APP

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
const findRedirectRule = ({ AuthUser, redirectConfig }) => {
  const config = redirectConfig || getConfig().redirectConfig
  if (!config) return null

  const redirect = AuthUser.id
    ? redirectConfig.authenticatedUser
    : redirectConfig.unauthenticatedUser

  return { redirect }
}

/**
 * processRedirect.
 *
 * @param {} redirectSettings
 */
const processRedirect = (redirectSettings) => {
  const redirectRule = findRedirectRule(redirectSettings)
  if (redirectRule) return redirectRule

  return findLegacyRedirect(redirectSettings)
}

/**
 * An wrapper for a page's exported getServerSideProps that
 * provides the authed user's info as a prop. Optionally,
 * this handles redirects based on auth status.
 * See this discussion on how best to use getServerSideProps
 * with a higher-order component pattern:
 * https://github.com/vercel/next.js/discussions/10925#discussioncomment-12471
 * @param {String} whenAuthed - The behavior to take if the user
 *   *is* authenticated. One of AuthAction.RENDER or
 *   AuthAction.REDIRECT_TO_APP. Defaults to AuthAction.RENDER.
 * @param {String} whenUnauthed - The behavior to take if the user
 *   is not authenticated. One of AuthAction.RENDER or
 *   AuthAction.REDIRECT_TO_LOGIN. Defaults to AuthAction.RENDER.
 * @param {String|Function} appPageURL - The redirect destination URL when
 *   we redirect to the app. Can either be a string or a function
 *   that accepts ({ctx, AuthUser}) as args and returns a string.
 * @param {String|Function} authPageURL - The redirect destination URL when
 *   we redirect to the login page. Can either be a string or a function
 *   that accepts ({ctx, AuthUser}) as args and returns a string.
 * @param {RedirectConfig} redirectConfig -
 * @return {Object} response
 * @return {Object} response.props - The server-side props
 * @return {Object} response.props.AuthUser
 */
const withAuthUserTokenSSR =
  (
    {
      whenAuthed = AuthAction.RENDER,
      whenUnauthed = AuthAction.RENDER,
      appPageURL = null,
      authPageURL = null,
      redirectConfig = null,
    } = {},
    { useToken = true } = {}
  ) =>
  (getServerSidePropsFunc) =>
  async (ctx) => {
    const AuthUser = await determineAuthUser({
      useToken,
      ...ctx,
      ...getConfig().cookies,
    })

    const AuthUserSerialized = AuthUser.serialize()

    const redirect = processRedirect({
      redirectConfig,
      whenAuthed,
      whenUnauthed,
      appPageURL,
      authPageURL,
      ctx,
      AuthUser,
    })
    if (redirect) return redirect

    // Prepare return data
    let returnData = { props: { AuthUserSerialized } }

    // Evaluate the composed getServerSideProps().
    if (getServerSidePropsFunc) {
      // Add the AuthUser to Next.js context so pages can use
      // it in `getServerSideProps`, if needed.
      ctx.AuthUser = AuthUser
      const composedProps = (await getServerSidePropsFunc(ctx)) || {}
      if (composedProps) {
        if (composedProps.props) {
          // If composedProps does have a valid props object, we inject AuthUser in there
          returnData = { ...composedProps }
          returnData.props.AuthUserSerialized = AuthUserSerialized
        } else if (composedProps.notFound || composedProps.redirect) {
          // If composedProps returned a 'notFound' or 'redirect' key
          // (as per official doc: https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering)
          // it means it contains a custom dynamic routing logic that should not be overwritten
          returnData = { ...composedProps }
        }
      }
    }

    return returnData
  }

export default withAuthUserTokenSSR
