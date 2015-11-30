exec = Npm.require('child_process').exec
os = Npm.require('os')

Plugin.registerCompiler
	extensions: ['version']
, -> new VersionCompiler()


class VersionCompiler
	processFilesForTarget: (files) ->
		files.forEach (file) ->
			output = JSON.parse file.getContentsAsString()
			output.compile =
				date: new Date().toISOString()
				nodeVersion: process.version
				arch: process.arch
				platform: process.platform
				osRelease: os.release()
				totalMemmory: os.totalmem()
				freeMemmory: os.freemem()
				cpus: os.cpus().length

			exec "git log --pretty=format:'%H%n%ad%n%an%n%s' -n 1", (err, result) ->
				if not err?
					result = result.split('\n')

					output.commit =
						hash: result.shift()
						date: result.shift()
						author: result.shift()
						subject: result.join('\n')

				exec "git describe --abbrev=0 --tags", (err, result) ->
					if not err?
						output.tag = result.replace('\n', '')

					exec "git rev-parse --abbrev-ref HEAD", (err, result) ->
						if not err?
							output.branch = result.replace('\n', '')

						output = """
							RocketChat.Version = #{JSON.stringify(output, null, 4)}
						"""

						file.addJavaScript({ data: output, path: file.getPathInPackage() + '.js' });
