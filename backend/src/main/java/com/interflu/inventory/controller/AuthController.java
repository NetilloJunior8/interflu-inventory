package com.interflu.inventory.controller;

import com.interflu.inventory.dto.AuthDto;
import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.UserRepository;
import com.interflu.inventory.security.CurrentUserHelper;
import com.interflu.inventory.security.JwtUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthDto.LoginRequest req) {
        if (req.getUsername() == null || req.getPassword() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Usuario y contraseña requeridos"));
        }
        User user = userRepo.findByUsernameIgnoreCase(req.getUsername().trim())
                .orElse(null);

        if (user == null || !user.isActive() || !passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            return ResponseEntity.status(401).body(Map.of("message", "Credenciales incorrectas o usuario inactivo"));
        }

        String token = jwtUtil.generateToken(user.getUsername(), user.getId());
        String roleStr = user.getRole() != null ? user.getRole() : "OPERADOR";
        return ResponseEntity.ok(new AuthDto.LoginResponse(token, user.getId(), user.getUsername(), user.getFullName(), roleStr));
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
