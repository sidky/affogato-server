import io.ktor.application.call
import io.ktor.http.ContentType
import io.ktor.response.respondText
import io.ktor.routing.get
import io.ktor.routing.routing
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main(args: Array<String>) {
    val port = System.getenv("PORT").toInt()
    val server = embeddedServer(Netty,port) {
        routing {
            get("/") {
                call.respondText("Hello, World again", ContentType.Text.Html)
            }

            get("/demo") {
                call.respondText("HELLO WORLD!")
            }
        }
    }
    System.out.printf("Listening on: $port")
    server.start(wait = true)
}