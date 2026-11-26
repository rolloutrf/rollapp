package ru.rollapp.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModelProvider

class RollappActivity : ComponentActivity() {
    private var sharedInput by mutableStateOf<ShareInput?>(null)
    private var shareSequence = 0
    private lateinit var session: AndroidSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = ViewModelProvider(this)[AndroidSession::class.java]
        enableEdgeToEdge()
        if (savedInstanceState == null) acceptIntent(intent)
        setContent {
            RollappTheme {
                RollappApp(
                    sharedInput = sharedInput,
                    onShareConsumed = { sharedInput = null },
                    session = session.state,
                    startLogin = { session.startLogin { url -> CustomTabsIntent.Builder().build().launchUrl(this, url) } },
                    retrySession = session::restore,
                    signOut = session::signOut,
                    share = { url ->
                        val send = Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, url)
                        startActivity(Intent.createChooser(send, getString(R.string.share_title)))
                    },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        acceptIntent(intent)
    }

    private fun acceptIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW) {
            intent.data?.let(session::finish)
            return
        }
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.take(2048)?.toString().orEmpty()
        sharedInput = ShareInput(++shareSequence, text)
    }
}

internal data class ShareInput(val sequence: Int, val text: String)
