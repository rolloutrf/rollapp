package ru.rollapp.android

import android.app.Application
import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private val sessionToken = Regex("[A-Za-z0-9_-]{43}")
private val sessionNames = setOf("__Secure-rollapp-session", "rw_session")
private const val authPath = "/api/auth/android"

internal data class NativeUser(
    val id: String,
    val name: String,
    val username: String,
    val avatarUrl: String?,
    val memberNumber: String?,
    val canDiscoverSpheres: Boolean,
    val mood: Int?,
)

internal data class NativeCredential(val cookie: String, val user: NativeUser)

internal sealed interface LoginState {
    data object Guest : LoginState
    data object Working : LoginState
    data class Open(val credential: NativeCredential) : LoginState
    data class Error(val message: String) : LoginState
}

internal class NativeHttpError(val status: Int, message: String? = null, val code: String? = null) : IOException(message)

private val jsonMediaType = "application/json".toMediaType()
private val nativeHttp = OkHttpClient.Builder()
    .followRedirects(false)
    .followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .connectTimeout(8, TimeUnit.SECONDS)
    .readTimeout(12, TimeUnit.SECONDS)
    .callTimeout(20, TimeUnit.SECONDS)
    .build()

internal suspend fun NativeCredential.request(
    path: String,
    body: JSONObject? = null,
    method: String = if (body == null) "GET" else "POST",
): JSONObject = requestNativeJson(path, cookie, user.id, body, method).json

internal suspend fun requestNativeJson(
    path: String,
    cookie: String? = null,
    accountId: String? = null,
    body: JSONObject? = null,
    method: String = if (body == null) "GET" else "POST",
): NativeResponse = withContext(Dispatchers.IO) {
    require(path.startsWith("/api/") && !path.contains('#'))
    val request = Request.Builder()
        .url(ROLLAPP_ORIGIN + path)
        .header("Accept", "application/json")
        .apply {
            if (cookie != null) header("Cookie", cookie)
            if (accountId != null) header("X-Rollapp-Account", accountId)
        }
        .method(method, body?.toString()?.toRequestBody(jsonMediaType))
        .build()
    nativeHttp.newCall(request).execute().use { response ->
        val responseBody = response.body
        val isJson = responseBody?.contentType()?.let { it.type == "application" && it.subtype == "json" } == true
        if (!response.isSuccessful) {
            val failure = if (isJson) runCatching {
                JSONObject(response.peekBody(8192).string())
            }.getOrNull() else null
            val message = failure?.opt("error") as? String
            val code = failure?.opt("code") as? String
            throw NativeHttpError(response.code, message?.take(320), code)
        }
        if (response.code == 204) return@use NativeResponse(JSONObject(), null)
        if (!isJson || responseBody == null) throw NativeHttpError(response.code)
        val json = responseBody.byteStream().use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                coroutineContext.ensureActive()
                val size = stream.read(buffer)
                if (size == -1) break
                if (output.size() + size > 8 * 1024 * 1024) throw IOException("Response too large")
                output.write(buffer, 0, size)
            }
            JSONObject(output.toString("UTF-8"))
        }
        val newCookie = response.headers("Set-Cookie").asSequence()
            .map { it.substringBefore(';') }.firstOrNull(::validSessionCookie)
        NativeResponse(json, newCookie)
    }
}

internal data class NativeResponse(val json: JSONObject, val cookie: String?)

private fun validSessionCookie(value: String) =
    value.substringBefore('=') in sessionNames && sessionToken.matches(value.substringAfter('=', ""))

private class SessionVault(context: Context) {
    private val preferences = context.getSharedPreferences("native-session", Context.MODE_PRIVATE)
    private val alias = "rollapp-native-session"
    private val transformation = "AES/GCM/NoPadding"

    private fun key(create: Boolean): SecretKey? {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(alias, null) as? SecretKey
        if (existing != null || !create) return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build())
        }.generateKey()
    }

    fun read(): String? = runCatching {
        val data = preferences.getString("data", null) ?: return null
        val parts = data.split('.', limit = 2)
        val cipher = Cipher.getInstance(transformation)
        cipher.init(Cipher.DECRYPT_MODE, requireNotNull(key(create = false)), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
        cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8).takeIf(::validSessionCookie)
    }.getOrElse { clear(); null }

    fun write(cookie: String) {
        require(validSessionCookie(cookie))
        val cipher = Cipher.getInstance(transformation)
        cipher.init(Cipher.ENCRYPT_MODE, requireNotNull(key(create = true)))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val data = Base64.encodeToString(cipher.doFinal(cookie.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(preferences.edit().putString("data", "$iv.$data").commit())
    }

    fun clear() {
        preferences.edit().remove("data").apply()
    }
}

internal class AndroidSession(application: Application) : AndroidViewModel(application) {
    private val vault = SessionVault(application)
    private var pending: AuthAttempt? = null
    var state by mutableStateOf<LoginState>(LoginState.Working)
        private set

    init {
        restore()
    }

    fun restore() {
        viewModelScope.launch {
            state = LoginState.Working
            val cookie = withContext(Dispatchers.IO) { vault.read() }
            state = if (cookie == null) LoginState.Guest else loadUser(cookie)
        }
    }

    fun startLogin(launch: (Uri) -> Unit) {
        if (state == LoginState.Working) return
        state = LoginState.Working
        viewModelScope.launch {
            state = try {
                val enabled = requestNativeJson("$authPath/config").json.optBoolean("enabled")
                if (!enabled) LoginState.Error("Нативный вход ещё не включён на сервере.") else {
                    launch(authorizationUrl())
                    LoginState.Guest
                }
            } catch (cause: CancellationException) {
                throw cause
            } catch (cause: NativeHttpError) {
                LoginState.Error(if (cause.status == 404) "Нативный вход ещё не включён на сервере."
                    else "Не удалось проверить доступность входа.")
            } catch (_: Exception) {
                LoginState.Error("Не удалось открыть браузер или подключиться к серверу.")
            }
        }
    }

    private fun authorizationUrl(): Uri {
        val attempt = AuthAttempt(randomKey(32), randomKey(64), android.os.SystemClock.elapsedRealtime())
        pending = attempt
        val client = if (getApplication<Application>().packageName.endsWith(".debug")) "debug" else "release"
        val challenge = MessageDigest.getInstance("SHA-256").digest(attempt.verifier.toByteArray(Charsets.US_ASCII))
        return Uri.parse(ROLLAPP_ORIGIN + authPath + "/authorize").buildUpon()
            .appendQueryParameter("challenge", encode(challenge))
            .appendQueryParameter("state", attempt.state)
            .appendQueryParameter("client", client)
            .build()
    }

    fun finish(uri: Uri) {
        if (uri.scheme != getApplication<Application>().packageName || uri.authority != null || uri.path != "/authorize") return
        val candidate = uri.getQueryParameter("code") ?: return
        val incomingState = uri.getQueryParameter("state") ?: return
        val attempt = pending ?: return
        if (!sessionToken.matches(candidate) || !sessionToken.matches(incomingState) ||
            android.os.SystemClock.elapsedRealtime() - attempt.startedAt > 15 * 60 * 1000 ||
            !MessageDigest.isEqual(incomingState.toByteArray(), attempt.state.toByteArray())) return
        pending = null
        viewModelScope.launch {
            state = LoginState.Working
            state = try {
                val response = requestNativeJson("$authPath/exchange",
                    body = JSONObject().put("code", candidate).put("verifier", attempt.verifier))
                val cookie = response.cookie ?: throw IOException("Missing session")
                withContext(Dispatchers.IO) { vault.write(cookie) }
                loadUser(cookie)
            } catch (cause: CancellationException) {
                throw cause
            } catch (_: Exception) {
                LoginState.Error("Не удалось завершить вход. Начните его заново.")
            }
        }
    }

    fun signOut(credential: NativeCredential) {
        viewModelScope.launch {
            state = LoginState.Working
            state = try {
                requestNativeJson("/api/auth/logout", credential.cookie, credential.user.id, JSONObject())
                vault.clear()
                LoginState.Guest
            } catch (cause: CancellationException) {
                throw cause
            } catch (_: Exception) {
                LoginState.Open(credential)
            }
        }
    }

    private suspend fun loadUser(cookie: String): LoginState = try {
        val json = requestNativeJson("/api/me", cookie).json.optJSONObject("user")
        if (json == null) {
            vault.clear()
            LoginState.Guest
        } else {
            val user = NativeUser(
                id = json.getString("id"),
                name = json.getString("name"),
                username = json.getString("username"),
                avatarUrl = resolveImage(json.optString("avatarUrl")),
                memberNumber = json.optString("memberNumber").takeIf { it.isNotBlank() && it != "null" },
                canDiscoverSpheres = json.optBoolean("canDiscoverSpheres"),
                mood = (json.opt("moodLevel") as? Number)?.toInt() ?: (json.opt("publicMood") as? Number)?.toInt(),
            )
            LoginState.Open(NativeCredential(cookie, user))
        }
    } catch (cause: CancellationException) {
        throw cause
    } catch (_: Exception) {
        LoginState.Error("Не удалось проверить сессию. Проверьте подключение к интернету.")
    }

    private data class AuthAttempt(val state: String, val verifier: String, val startedAt: Long)
    private fun randomKey(size: Int) = encode(ByteArray(size).also(SecureRandom()::nextBytes))
    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}
