.PHONY: all clean minified compiled

NPM_BIN = $(shell npm bin)
BABEL ?= $(NPM_BIN)/babel
UGLIFY ?= $(NPM_BIN)/uglifyjs

all: minified
minified: issues.minified.gs main.minified.gs
compiled: issues.compiled.gs main.compiled.gs

%.compiled.gs: %.js node_modules
	$(BABEL) --presets env -o $@ $<

%.minified.gs : %.compiled.gs node_modules
	$(UGLIFY) --comments -o $@ $<

node_modules: package.json
	npm install
	touch -ma node_modules

clean:
	rm *.*.gs
