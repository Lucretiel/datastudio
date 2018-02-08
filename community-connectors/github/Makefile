.PHONY: all clean minified compiled clean-modules clean-all

NPM_BIN = $(shell npm bin)
BABEL ?= $(NPM_BIN)/babel
UGLIFY ?= $(NPM_BIN)/uglifyjs

all: minified
minified: issues.minified.gs main.minified.gs
compiled: issues.compiled.gs main.compiled.gs

%.compiled.gs: %.js node_modules
	$(BABEL) --presets env -o $@ $<

%.minified.gs : %.compiled.gs node_modules
	$(UGLIFY) --comments --mangle -o $@ $<

node_modules: package.json
	npm install
	touch -ma node_modules

clean:
	rm -f *.*.gs

clean-modules:
	rm -rf node_modules package-lock.json

clean-all: clean clean-modules
