"use strict"

const apply_ = (object, name, value) => {
	if value != null {
		object[name] = value
	}
}

const mapObject_ = (obj, func) =>
	Object.keys(obj).map(key => func(obj[key], key, obj))

const encodeQuery = query => '?' + mapObject_(query, (value, key) =>
	`${encodeURIComponent(key)}=${encodeURIComponent(value)}`
).join('&')


const find_ = (array, pred) => {
	for(let i = 0; i < array.length; i++) {
		const e = array[i]
		if(pred(e, i, array)) {
			return e
		}
	}
	return undefined
}

const shallowMerge_ = objects => {
	const result = {}
	objects.forEach(object => {
		if(object)
			for(const key in object)
				result[key] = object[key]
	})
	return result
}


const genericMap_ = (iterable, func) =>
	iterable instanceof Array ?
		iterable.map(func) :
		mapObject_(iterable, func)


const badShallowCompare_ = (lhs, rhs) => {
	for(const key in lhs) {
		if(lhs[key] !== rhs[key]) {
			return false
		}
	}
	return true
}

const makeKeyedSchema_ = schema => {
	const keyedSchema = {}
	schema.forEach(field => keyedSchema[field.name] = field)
	return keyedSchema
}


const makeUnkeyedSchema_ = keyedSchema => {
	return Object.keys(keyedSchema).map(name => {
		const field = keyedSchema[name]
		field.name = name
		return field
	})
}


const makeSchemas_ = schema => schema instanceof Array ?
	{unkeyedSchema: schema, keyedSchema: makeKeyedSchema_(schema)} :
	{unkeyedSchema: makeUnkeyedSchema_(schema), keyedSchema: schema)}



const makeSchemaGetters_ = schema => {
	if(schema instanceof Function) {
		let keyedSchema = null
		let unkeyedSchema = null
		let knownConfig = null

		const refreshSchema = function(request, authClient) {
			if(knownConfig && !badShallowCompare_(request.configParams, knownConfig)) {
				knownConfig = request.configParams
				{keyedSchema, unkeyedSchema} = makeSchemas(schema.call(this, request, authClient))
			}
		}

		return {
			getSchema(request, authClient) {
				refreshSchema.call(this, request, authClient)
				return unkeyedSchema
			},
			getKeyedSchema(request, authClient) {
				refreshSchema.call(this, request, authClient)
				return keyedSchema
			}
		}

	} else {
		const {keyedSchema, unkeyedSchema} = makeSchemas(schema)

		return {
			getSchema: () => unkeyedSchema,
			getKeyedSchema: () => keyedSchema,
		}
	}
}


const makeConfigGetter_ = config => config instanceof Function ? config : () => config


const baseConnector_ = Object.freeze({
	// CONFIG
	config: undefined

	// SCHEMA
	schema: undefined

	// GET ALL THE DATA
	getData(request, fieldNames, authClient) {
		const receivedData = this.fetchData(request, fieldNames, authClient)
		return this.baseTransformData(request, fieldNames, authClient, receivedData)
	}

	// DATA FETCH
	fetchData(request, fieldNames, authClient) {
		// TODO(nathanwest): allow customizing data parsing
		return JSON.parse(this.fetchContent(request, fieldNames, authClient))
	}

	fetchContent(request, fieldNames, authClient) {
		return this.fetchResponse(request, fieldNames, authClient).getContentText()
	}

	fetchResponse(request, fieldNames, authClient) {
		const options = this.getOptions(request, fieldNames, authClient)
		const url = this.getUrl(request, fieldNames, authClient)

		return UrlFetchApp.fetch(url, options))
	}

	getOptions(request, fieldNames, authClient) {
		return {
			headers: this.getHeaders(request, fieldNames, authClient)
			method: this.getMethod(request, fieldNames, authClient)
			contentType: this.getContentType(request, fieldNames, authClient)
			payload: this.getPayload(request, fieldNames, authClient)
		}
	}

	headers: undefined
	getHeaders(request, fieldNames, authClient) {
		if(this.headers)
			return this.headers

		const headers = this.getExtraHeaders(request, fieldNames, authClient)
		const accept = this.getAccept(request, fieldNames, authClient)
		const auth = this.getAuthHeader(request, fieldNames, authClient)

		return shallowMerge_(
			headers,
			accept ? {"Accept": accept} : null,
			auth ? {"Authorization": auth} : null
		)
	}

	extraHeaders: undefined
	getExtraHeaders(request, fieldNames, authClient) {
		return this.extraHeaders
	}

	accept: "application/json"
	getAccept(request, fieldNames, authClient) { return this.accept }

	getAuthHeader(request, fieldNames, authClient) {
		const token = this.getAuthToken(request, fieldName, authClient)
		return token ? `token ${token}` : undefined
	}

	getAuthToken(request, fieldNames, authClient) {
		return authClient ? authClient.getAccessToken() : undefined
	}

	method: "get"
	getMethod(request, fieldNames, authClient) { return this.method }

	contentType: undefined
	getContentType(request, fieldNames, authClient) { return this.contentType }


	url: undefined
	getUrl(request, fieldNames, authClient) {
		if(this.url)
			return this.url

		const baseUrl = this.getBaseUrl(request, fieldNames, authClient)
		const query = this.getQuery(request, fieldNames, authClient)
		const queryString = query ? encodeQuery(query) : ''
		return `${baseUrl}${queryString}`
	}

	baseUrl: undefined
	getBaseUrl(request, fieldNames, authClient) {
		if(this.baseUrl)
			return this.baseUrl
		else
			throw new Error("need to set baseUrl or define getBaseUrl or one of its ancestores")
	}

	query: undefined
	getQuery(request, fieldNames, authClient) { return this.query }

	// DATA PROCESSING
	baseTransformData(receivedData, fieldNames, request, fieldNames, authClient) {
		const schema = this.getKeyedSchema(request, fieldNames, authClient)
		return {
			schema: fieldNames.map(fieldName => schema[fieldName])
			cachedData: false,
			rows: this.transformData(receivedData, fieldNames, request).map(
				transformedRow => ({values: transformedRow})
			),
		}
	}

	transformData(receivedData, fieldNames, request) {
		return genericMap_(receivedData, (receivedRow, receivedKey) =>
			this.transformRow(receivedRow, fieldNames, receivedKey, request)
		)
	}

	transformRow(receivedRow, fieldNames, receivedKey, request) {
		return fieldNames.map(
			fieldName => this.transformNamedField(fieldName, receivedRow, receivedKey, request)
		)
	}

	transformNamedField(fieldName, receivedRow, receivedKey, request) {
		const receivedField = this.findFieldOrDefault(fieldName, receivedRow, receivedKey, request)
		return this.transformField(receivedField, fieldName, request)
	}

	findFieldOrDefault(fieldName, receivedRow, receivedKey, request) {
		let field = this.findField(fieldName, receivedRow, receivedKey, request)
		if(field !== undefined)
			return field

		field = getDefaultField(fieldName, request)
		if(field !== undefined)
			return field

		throw new Error(
			`Couldn't find field ${fieldName} in response row ${responseRow}. ` +
			"Ensure that the key is available in your response, or define " +
			"one of findField/getDefaultField, or set defaultField/defaultFields."
		)
	}

	fieldMapping: undefined
	findField(fieldName, receivedRow, receivedKey, request) {
		if(fieldMapping) {
			const mappedName = fieldMapping[fieldName]
			if(mappedName)
				return receivedRow[mappedName]
		}
		return receivedRow[fieldName]
	}

	defaultField: undefined
	defaultFields: undefined
	getDefaultField(fieldName, request) {
		if(this.defaultFields) {
			const field = defaultFields[fieldName]
			if(field !== undefined)
				return field
		}
		return this.defaultField
	}

	transformers: undefined
	transformField(receivedField, fieldName, request) {
		const transformers = this.transformers
		if(transformers) {
			const transformer = this.transformers[fieldName]
			if(transformer)
				return transformer(receivedField)
		}
		return receivedField
	}
})


const getConnectorInterface = (connector, getAuthClient) => {
	const authClient = getAuthClient ? getAuthClient() : null

	const getConfig = request => connector.getConfig(request, authClient)
	const getSchema = request => connector.getSchema(request, authClient)
	const getData = request => connector.getData(
		request, request.fields.map(field => field.name), authClient
	)

	return {getConfig, getSchema, getData}
}


const createPartialConnector_ = connectorDef => {
	const schema = connector.schema
	if(!schema) {
		throw new Error("Must define .schema as a schema, keyed schema, or function")
	}

	const schemaMethods = makeSchemaGetters_(schema)

	return shallowMerge_(baseConnector_, connector, schemaMethods)
}


const createConnector = connectorDef => {
	const config = connector.config
	if(!config) {
		throw new Error("Must define .config as a configuration or function")
	}

	const getConfig = makeConfigGetter_(config)
	return shallowMerge_(createPartialConnector_(connectorDef), {getConfig})

}


const combineConnectors = ({config, connectors}) => {
	const partialConnectors = connectors.map(createPartialConnector_)
	const baseGetConfig = makeConfigGetter_(config)
	const key = "combineConnectors__connectorSelection"

	const connectorOptionDef = [{
		type: "SELECT_SINGLE",
		name: key,
		displayName: "Data Type",
		helpText: "Select the type of data you want.",
		options: genericMap_(connectors, (connector, key) => ({
			value: key, label: connector.label,
		}))
	}]

	const getConnector = request => connectors[request.configParams[key]]

	return {
		getConfig(request, authClient) {
			const baseConfig = baseGetConfig(request, authClient)
			return shallowMerge_(baseConfig, {
				configParams: baseConfig.configParams.concat(connectorOptionDef)
			})
		},
		getSchema(request, authClient) {
			return getConnector(request).getSchema(request, authClient)
		},
		getData(request, fieldNames, authClient) {
			return getConnector(request).getData(request, fieldNames, authClient)
		}
	}
}
