<?php
/*
 * Skopiuj ten plik jako: api/instagram-config.php
 * Wstaw własny token z oficjalnego Meta / Instagram API.
 * Nie wrzucaj tokenu do index.html ani JavaScriptu.
 */

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(404);
    exit;
}

// Najprostszy wariant: Instagram API with Instagram Login.
define('IG_API_MODE', 'instagram_login');
define('IG_ACCESS_TOKEN', 'WKLEJ_TUTAJ_DLUGOWIECZNY_TOKEN');

// Ustaw wersję API zgodną z wersją w Twojej aplikacji Meta.
define('IG_GRAPH_VERSION', 'v24.0');

// Cache na 10 minut.
define('IG_CACHE_TTL', '600');

/*
 * Jeśli używasz wariantu Facebook Login, zamiast powyższego trybu ustaw:
 * define('IG_API_MODE', 'facebook_login');
 * define('IG_USER_ID', 'TWOJE_INSTAGRAM_PROFESSIONAL_ACCOUNT_ID');
 */
