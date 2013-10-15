MODULE_NAME=glue

PHONY: dist

deps:
	@hash browserify 2>/dev/null || (echo "require browserify to be installed" && exit 1)
	@hash uglifyjs 2>/dev/null || (echo "require uglifyjs to be installed" && exit 1)

dist: deps
	@mkdir -p dist

	@echo "building"
	@browserify index.js > dist/glue.js --standalone ${MODULE_NAME}

	@echo "minifying"
	@uglifyjs dist/glue.js > dist/glue.min.js 2>/dev/null