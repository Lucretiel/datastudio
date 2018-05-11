/**
 * Utility stuff
 */

const logged = (name, func, logWhen = null) => function() {
	if(logWhen && !logWhen.apply(this, arguments)) {
		return func.apply(this, arguments)
	} else {
		Logger.log("Calling %s with arguments:\n%s", name, arguments)
		const result = func.apply(this, arguments)
		Logger.log("%s returned:\n%s", name, result)
		return result
	}
}

const makeKeyedSchema = schema => {
	result = {}
	schema.forEach(field => { result[field.name] = field })
	return result
}

const makeUnkeyedSchema = keyedSchema => {
	result = []
	for(const name in keyedSchema) {
		const field = keyedSchema[key]
		field.name = key
		result.push(field)
	}
	return result
}

const schemaForFields = (keyedSchema, fieldNames) =>
	fieldNames.map(name => keyedSchema[name])


// Helper function for creating connectors. Performs the follwoung transformations:
const normalizeConnector = connector => {
	if(!connector.getSchema) {
		if(connector.schema) {
			connector.keyedSchema = makeKeyedSchema(connector.schema)
		} else if(connector.keyedSchema) {
			connector.schema = makeUnkeyedSchema(connector.keyedSchema)
		}

		connector.getSchema = request => connector.schema
	}

	if(!connector.getData) {
		if(!connector.transformBlob) {
			connector.transformBlob = (blob, fieldNames) => ({
				cachedData: false,
				schema: schemaForFields(connector.keyedSchema, fieldNames),
				rows: blob.map(rowBlob => ({values: transformRow(rowBlob, fieldNames)}))
			})
		}
		connector.getData = request => {
			const { org, repo } = request.configParams
			const fieldNames = request.fields.map(field => field.name)

		}
	}
}

/**
 * Github Data Connecors
 */

const GITHUB_CONNECTORS = {
	stars: makeConnector({

	}),
	issues: makeConnector({

	})
}

/**
 * OAUTH API
 *
 * This stuff should be the same regardless of the data schema we want to use.
 */

const singleton = func => {
	const sentinel = {}
	let instance = sentinel
	const wrapper = () => instance === sentinel ?
		(instance = func()) : instance
	wrapper.reset = () => {
		const local = instance
		instance = sentinel
		return local
	}
	return wrapper
}

const getOAuthService = singleton(() => {
	const scriptProps = PropertiesService.getScriptProperties()
	return OAuth2.createService('github')
		.setAuthorizationBaseUrl('https://github.com/login/oauth/authorize')
		.setTokenUrl('https://github.com/login/oauth/access_token')
		.setClientId(scriptProps.getProperty('OAUTH_CLIENT_ID'))
		.setClientSecret(scriptProps.getProperty('OAUTH_CLIENT_SECRET'))
		.setPropertyStore(PropertiesService.getUserProperties())
		.setCallbackFunction('authCallback')
})


// These 5 functions fulfill the Community Connector OAuth interface
const authCallback = request =>
	getOAuthService().handleCallback(request) ?
		HtmlService.createHtmlOutput('Success! You can close this tab.') :
		HtmlService.createHtmlOutput('Denied. You can close this tab')


const isAuthValid = () => getOAuthService().hasAccess()
// The first reset is for singleton, which returns the underlying service.
const resetAuth = () => getOAuthService.reset().reset()

const get3PAuthorizationUrls = () => getOAuthService().getAuthorizationUrl()

const isAdminUser = () => true


/**
 * Connector Data Retrieval
 */

const getConfig = logged("getConfig", request => ({
	configParams: [{
		name: "org",
		displayName: "Organization",
		helpText: "The name of the organization (or user) that owns the repo",
		placeholder: "google",
	}, {
		name: "repo",
		displayName: "Repository",
		helpText: "The name of the repository you want issues from",
		placeholder: "datastudio",
	}, {
		name: "githubDataType",
		displayName: "Github Data Type",
		helpText: "The type of data you want from the repository",
		type: "SELECT_SINGLE",
		options: getGithubDataTypes(),
	}],
}))
