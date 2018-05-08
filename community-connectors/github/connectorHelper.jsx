"use strict"


/**
 * Same as map, but iterates over the properties of an object
 * @param  {!Object<string, T>} obj  The object to map over
 * @param  {!function(T, string, Object<string, T>): U} func function to apply
 *   to each element in the Object. The function is called with
 *   (value, key, object)
 * @return {!Array<U>} The mapped array
 * @template T, U
 */
const mapObject_ = (obj, func) =>
	Object.keys(obj).map(key => func(obj[key], key, obj))

/**
 * Convert an object's keys and values into an URL query string. Includes the
 * preceeding "?". Escapes all the necessary characters in the keys and values.
 *
 * @param  {!Object<string, string>} query The object to convert into a URL
 *   query
 * @return {!string} The encoded query string.
 */
const encodeQuery = query => {
	const encoded = mapObject_(query, (value, key) =>
		`${encodeURIComponent(key)}=${encodeURIComponent(value)}`
	).join('&')

	return encoded === "" ? "" : `?${encoded}`
}


/**
 * Simple array find. Applies a predicate to each element of an array,
 * returning the first element for which the predicate returns true. Returns
 * undefined if no element matches.
 *
 * @param  {!Array<T>} array The array to search
 * @param  {!function(T): boolean} pred  The predicate to apply to each member
 *   of array
 * @return {?T} The first element matching the predicate, or undefined if none
 *   was found.
 * @template T
 */
const find_ = (array, pred) => {
	for(let i = 0; i < array.length; i++) {
		const e = array[i]
		if(pred(e, i, array)) {
			return e
		}
	}
	return undefined
}


/**
 * Shallowly merge any number of objects. Null objects will be skipped, and
 * properties with undefined values will also be skipped. Properties of later
 * objects override those from earlier objects.
 *
 * This is an immutable merge; a new object is created, and the old ones are
 * not modified.
 *
 * @param  {!Array<?Object<string, ?*>>} objects An array of objects to
 *   shallowly merge
 * @return {!Object<string, *>} The merged object.
 */
const shallowMerge_ = objects => {
	const result = {}
	objects.forEach(object => {
		if(object) {
			for(const key in object) {
				if(object[key] !== undefined) {
					result[key] = object[key]
				}
			}
		}
	})
	return result
}


/**
 * Map over an array OR an object. Returns an array of calling func on each
 * element in the array or object.
 *
 * @param  {!Array<T>|Object<string, T>} iterable An object or array to map over
 * @param  {!function(T, string|number, Array<T>|Object<string, T>): U} func The
 *   mapping function. Called once for each element in the array or object.
 *   Called with (value, index|key, array|object)
 * @return {!Array<U>} The mapped array
 * @template T, U
 */
const genericMap_ = (iterable, func) =>
	iterable instanceof Array ?
		iterable.map(func) :
		mapObject_(iterable, func)


/**
 * Shallowly conmpare two objects. This is a "bad" shallow compare, because it
 * simply compares all the keys in lhs to rhs, without looking at their length.
 * It is intended to be used with objects that have the same layoyt, or at
 * least, the same length. Compares each value with ===
 * @param  {!Object<string, *>} lhs The first object to compare
 * @param  {!Object<string, *>} rhs The second object to compare
 * @return {!boolean} True if the two objects compare shallowly equal, false
 *   otherwise
 */
const badShallowCompare_ = (lhs, rhs) => {
	for(const key in lhs) {
		if(lhs[key] !== rhs[key]) {
			return false
		}
	}
	return true
}

/**
 * Convert a community connector schema, which is an array of schema Fields,
 * into a keyed schema. A keyed schema is an Object containing schema Fields,
 * keyed on field.name for each field.
 * @param  {Array<Object>} schema The schema to convert
 * @return {Object<string, Object>} The keyed schema
 */
const makeKeyedSchema = schema => {
	const keyedSchema = {}
	schema.forEach(field => keyedSchema[field.name] = field)
	return keyedSchema
}


/**
 * The opposite of {@link makeKeyedSchema}: convert a keyed schema into a
 * unkeyed (array) schema. With this function, the .name property of each
 * schema field is optional, and will be (mutatively) added to each field, if
 * it is missing.
 *
 * @todo (nathanwest): Add SchemaField type.
 *
 * @param  {Object<string, Object>} keyedSchema The keyed schema. The values
 *   of this object will have .name added to them, if it is not present already
 * @return {Array<Object>}             [description]
 */
const makeUnkeyedSchema = keyedSchema =>
	mapObject_(keyedSchema, (field, name) => {
		field.name = field.name || name
		return name
	})


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
			getUnkeyedSchema(request, authClient) {
				refreshSchema.call(this, request, authClient)
				return unkeyedSchema
			},
			getKeyedSchema(request, authClient) {
				refreshSchema.call(this, request, authClient)
				return keyedSchema
			}
			getSchema(request, authClient) {
				refreshSchema.call(this, request, authClient)
				return ({ schema: unkeyedSchema })
			}

		}

	} else {
		const {keyedSchema, unkeyedSchema} = makeSchemas(schema)
		const schema = ({schema: unkeyedSchema})

		return {
			getUnkeyedSchema: () => unkeyedSchema,
			getKeyedSchema: () => keyedSchema,
			getSchema: () => schema,
		}
	}
}


const makeGetConfig = config => config instanceof Function ? config : () => config


const baseConnector_ = Object.freeze({
	// SCHEMA
	schema: undefined

	// LABEL: Only needed with multiconnector
	label: undefined

	// GET ALL THE DATA
	getData(request, fieldNames, authClient) {
		const receivedContent = this.fetchContent(request, fieldNames, authClient)
		return this.transformContent(receivedContent, fieldNames, request, authClient)
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
			{"Accept": accept, "Authorization": auth},
		)
	}

	extraHeaders: undefined
	getExtraHeaders(request, fieldNames, authClient) {
		return this.extraHeaders
	}

	accept: "application/json"
	getAccept(request, fieldNames, authClient) { return this.accept }

	getAuthHeader(request, fieldNames, authClient) {
		// TODO: raise errors more aggressively here.
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
	transformContent(receivedContent, fieldNames, request, fieldNames, authClient) {
		const keyedSchema = this.getKeyedSchema(request, fieldNames, authClient)
		const receivedData = JSON.parse(receivedContent)
		return {
			schema: fieldNames.map(fieldName => keyedSchema[fieldName])
			cachedData: false,
			rows: this.transformData(receivedData, fieldNames, request).map(
				transformedRow => ({
					values: (transformedRow instanceof Array ?
						transformedRow :
						fieldNames.map(fieldName => transformedRow[fieldName])
					)
				})
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


const createPartialConnector = connectorDef => {
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


const createMultiConnector = ({config, connectorDefs}) => {
	const partialConnectors = connectorDefs.map(createPartialConnector)
	const baseGetConfig = makeConfigGetter_(config)
	const key = "combineConnectors__connectorSelection"

	const connectorOptionDef = [{
		type: "SELECT_SINGLE",
		name: key,
		displayName: "Data Type",
		helpText: "Select the type of data you want.",
		options: genericMap_(connectorDefs, (connector, connectorKey) => ({
			value: connectorKey, label: connector.label,
		}))
	}]

	const getConnector = request => connectorDefs[request.configParams[key]]

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

const getConnectorInterface = (connector, getAuthClient) => {
	const authClient = getAuthClient ? getAuthClient() : null

	const getConfig = request => connector.getConfig(request, authClient)
	const getSchema = request => connector.getSchema(request, authClient)
	const getData = request => connector.getData(
		request, request.fields.map(field => field.name), authClient
	)

	return {getConfig, getSchema, getData}
}
