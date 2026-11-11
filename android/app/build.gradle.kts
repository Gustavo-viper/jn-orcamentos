import java.util.Properties

plugins {
    id("com.android.application")
}

// Endereço do sistema publicado (o app abre este site em tela cheia — Trusted Web Activity)
val appHost = "jn-orcamentos.up.railway.app"

// Chave de assinatura: android/keystore/keystore.properties (NÃO versionar; guardar backup)
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore/keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "br.com.jndecoracoes.orcamentos"
    compileSdk = 36

    buildFeatures {
        resValues = true
    }

    defaultConfig {
        applicationId = "br.com.jndecoracoes.orcamentos"
        minSdk = 24
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
        manifestPlaceholders["hostName"] = appHost
        manifestPlaceholders["defaultUrl"] = "https://$appHost/"
        resValue("string", "app_name", "J&N Orçamentos")
        resValue(
            "string",
            "asset_statements",
            "[{\\\"relation\\\": [\\\"delegate_permission/common.handle_all_urls\\\"], \\\"target\\\": {\\\"namespace\\\": \\\"web\\\", \\\"site\\\": \\\"https://$appHost\\\"}}]",
        )
    }

    signingConfigs {
        create("release") {
            if (keystoreProps.isNotEmpty()) {
                storeFile = rootProject.file("keystore/" + keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
