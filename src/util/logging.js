

let prevMessage = ""
let dotCount = 0

export function log(clubhouseStoryURL) {

  var message = ""
  for (var i = 0; i < arguments.length; i++) {
   message += arguments[i];
  }
  // do not repeat the previous message, just output a dot
  if (message === prevMessage) {
    process.stdout.write(".")
    dotCount += 1
  }
  else {
    prevMessage = message
    if (dotCount > 0) {
      dotCount = 0
    }
    process.stdout.write("\n" + message)
  }

}
