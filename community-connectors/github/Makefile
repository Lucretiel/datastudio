.PHONY: all clean

NPM_BIN = $(shell npm bin)
BABEL ?= $(NPM_BIN)/babel
UGLIFY ?= $(NPM_BIN)/uglifyjs

%.compiled.gs: %.js node_modules
	$(BABEL) --presets env -o $@ $<

%.minified.gs : %.compiled.gs
	$(UGLIFY) --comments -o $@ $<

all: issues.minified.gs main.minified.gs

clean:
	rm *.*.gs
