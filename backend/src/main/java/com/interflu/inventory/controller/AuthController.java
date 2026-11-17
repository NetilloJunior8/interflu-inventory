package com.interflu.inventory.controller;

import com.interflu.inventory.dto.AuthDto;
import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.UserRepository;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.security.JwtUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final CurrentUserHelper userHelper;

    public AuthController(UserRepository userRepo, PasswordEncoder passwordEncoder, JwtUtil jwtUtil, CurrentUserHelper userHelper) {
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.userHelper = userHelper;
    }

    @PostMapping("/sso")
    public ResponseEntity<?> ssoLogin(@RequestBody Map<String, String> body) {
        String ssoToken = body.get("token");
        if (ssoToken == null || ssoToken.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Token SSO requerido"));
        }
        if (!jwtUtil.validateToken(ssoToken)) {
            return ResponseEntity.status(401).body(Map.of("message", "Token SSO inválido o expirado"));
        }
        String cleanUser = jwtUtil.extractUsername(ssoToken);
        if (cleanUser == null || cleanUser.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("message", "Token inválido sin usuario"));
        }
        cleanUser = cleanUser.trim();

        User user = userRepo.findByUsernameIgnoreCase(cleanUser).orElse(null);
        if (user == null) {
            String role = ("aaron".equalsIgnoreCase(cleanUser) || "sistemas".equalsIgnoreCase(cleanUser)) ? "SISTEMAS" : "OPERADOR";
            user = new User(cleanUser, passwordEncoder.encode(UUID.randomUUID().toString()), cleanUser.toUpperCase());
            user.setRole(role);
            user = userRepo.save(user);
        } else if (!user.isActive()) {
            user.setActive(true);
            user = userRepo.save(user);
        }

        String token = jwtUtil.generateToken(user.getUsername(), user.getId());
        String roleStr = user.getRole() != null ? user.getRole() : "OPERADOR";
        return ResponseEntity.ok(new AuthDto.LoginResponse(token, user.getId(), user.getUsername(), user.getFullName(), roleStr));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthDto.LoginRequest req) {
        if (req.getUsername() == null || req.getPassword() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Usuario y contraseña requeridos"));
        }
        String cleanUser = req.getUsername().trim();
        User user = userRepo.findByUsernameIgnoreCase(cleanUser).orElse(null);

        boolean passwordMatches = (user != null && user.isActive() && passwordEncoder.matches(req.getPassword(), user.getPassword()));

        // Si falló localmente, consultar contra Interflugestor API (Credenciales Compartidas Unificadas)
        if (!passwordMatches) {
            Map<String, Object> gestorAuth = tryGestorAuth(cleanUser, req.getPassword());
            if (gestorAuth != null && Boolean.TRUE.equals(gestorAuth.get("success"))) {
                String rolGestor = (String) gestorAuth.get("rol");
                String roleSystem = (rolGestor != null && rolGestor.equalsIgnoreCase("Administrador")) ? "SISTEMAS" : "OPERADOR";
                String nombreCompleto = gestorAuth.get("nombre") != null ? (String) gestorAuth.get("nombre") : cleanUser.toUpperCase();

                if (user == null) {
                    user = new User(cleanUser, passwordEncoder.encode(req.getPassword().trim()), nombreCompleto);
                    user.setRole(roleSystem);
                    user = userRepo.save(user);
                } else {
                    user.setPassword(passwordEncoder.encode(req.getPassword().trim()));
                    user.setFullName(nombreCompleto);
                    user.setRole(roleSystem);
                    user.setActive(true);
                    user = userRepo.save(user);
                }
                passwordMatches = true;
            }
        }

        if (!passwordMatches || user == null || !user.isActive()) {
            return ResponseEntity.status(401).body(Map.of("message", "Credenciales incorrectas o usuario inactivo"));
        }

        String token = jwtUtil.generateToken(user.getUsername(), user.getId());
        String roleStr = user.getRole() != null ? user.getRole() : "OPERADOR";
        return ResponseEntity.ok(new AuthDto.LoginResponse(token, user.getId(), user.getUsername(), user.getFullName(), roleStr));
    }

    private Map<String, Object> tryGestorAuth(String username, String password) {
        try {
            List<String> targetUrls = List.of(
                    System.getenv().getOrDefault("INTERFLU_GESTOR_AUTH_URL", "http://host.docker.internal:8088/api/auth/login"),
                    "http://127.0.0.1:8088/api/auth/login",
                    "https://interflugestor.flucito.com/api/auth/login"
            );

            String jsonPayload = String.format("{\"username\":\"%s\",\"password\":\"%s\"}", 
                    username.replace("\"", "\\\""), 
                    password.replace("\"", "\\\""));

            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(2))
                    .build();

            for (String url : targetUrls) {
                try {
                    HttpRequest request = HttpRequest.newBuilder()
                            .uri(URI.create(url))
                            .header("Content-Type", "application/json")
                            .timeout(Duration.ofSeconds(3))
                            .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                            .build();

                    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                    if (response.statusCode() == 200 && response.body() != null && response.body().contains("\"token\"")) {
                        String body = response.body();
                        String rol = body.contains("\"rol\":\"Administrador\"") ? "Administrador" : "Operador";
                        return Map.of("success", true, "rol", rol, "nombre", username.toUpperCase());
                    }
                } catch (Exception ignored) {
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser() {
        User user = userHelper.getCurrentUser();
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "fullName", user.getFullName(),
                "role", user.getRole() != null ? user.getRole() : "OPERADOR"
        ));
    }

    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        return userRepo.findByActiveTrue().stream().map(u -> Map.<String, Object>of(
                "id", u.getId(),
                "username", u.getUsername(),
                "fullName", u.getFullName()
        )).toList();
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestBody AuthDto.CreateUserRequest req) {
        if (req.getUsername() == null || req.getUsername().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "El nombre de usuario es obligatorio"));
        }
        if (req.getPassword() == null || req.getPassword().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "La contraseña es obligatoria"));
        }
        String cleanUser = req.getUsername().trim();
        if (userRepo.findByUsername(cleanUser).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("message", "El usuario '" + cleanUser + "' ya existe"));
        }
        String fullName = (req.getFullName() != null && !req.getFullName().isBlank()) ? req.getFullName().trim() : cleanUser;
        User user = new User(cleanUser, passwordEncoder.encode(req.getPassword().trim()), fullName);
        user = userRepo.save(user);

        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "fullName", user.getFullName(),
                "message", "Usuario creado exitosamente"
        ));
    }
}
