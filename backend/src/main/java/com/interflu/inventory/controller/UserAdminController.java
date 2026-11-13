package com.interflu.inventory.controller;

import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.UserRepository;
import com.interflu.inventory.security.CurrentUserHelper;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {

    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final CurrentUserHelper userHelper;

    public UserAdminController(UserRepository userRepo, PasswordEncoder passwordEncoder, CurrentUserHelper userHelper) {
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.userHelper = userHelper;
    }

    private boolean isNotSistemas() {
        User currentUser = userHelper.getCurrentUser();
        return currentUser == null || !"SISTEMAS".equalsIgnoreCase(currentUser.getRole());
    }

    @GetMapping
    public ResponseEntity<?> listUsers() {
        if (isNotSistemas()) {
            return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado: solo el administrador de Sistemas puede consultar o administrar usuarios."));
        }
        List<User> users = userRepo.findAll();
        List<Map<String, Object>> result = users.stream().map(u -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", u.getId());
            map.put("username", u.getUsername());
            map.put("fullName", u.getFullName());
            map.put("role", u.getRole());
            map.put("active", u.isActive());
            map.put("createdAt", u.getCreatedAt());
            return map;
        }).toList();
        return ResponseEntity.ok(result);
    }

    @PostMapping
    public ResponseEntity<?> createUser(@RequestBody Map<String, String> body) {
        if (isNotSistemas()) {
            return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado: solo el administrador de Sistemas puede registrar usuarios."));
        }
        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "").trim();
        String fullName = body.getOrDefault("fullName", "").trim();
        String role = body.getOrDefault("role", "OPERADOR").trim();

        if (username.isBlank() || password.isBlank() || fullName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Usuario, contraseña y nombre completo son requeridos."));
        }

        if (userRepo.findByUsernameIgnoreCase(username).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("message", "El usuario '" + username + "' ya existe en el sistema."));
        }

        User newUser = new User(username, passwordEncoder.encode(password), fullName, role);
        newUser = userRepo.save(newUser);

        return ResponseEntity.ok(Map.of(
                "id", newUser.getId(),
                "username", newUser.getUsername(),
                "fullName", newUser.getFullName(),
                "role", newUser.getRole(),
                "active", newUser.isActive()
        ));
    }

    @PutMapping("/{id}/password")
    public ResponseEntity<?> changePassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        if (isNotSistemas()) {
            return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado: solo el administrador de Sistemas puede modificar contraseñas."));
        }
        String newPassword = body.containsKey("newPassword") ? body.get("newPassword") : body.getOrDefault("password", "");
        if (newPassword == null) newPassword = "";
        newPassword = newPassword.trim();
        if (newPassword.isBlank() || newPassword.length() < 4) {
            return ResponseEntity.badRequest().body(Map.of("message", "La nueva contraseña debe tener al menos 4 caracteres."));
        }

        User user = userRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado."));

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepo.save(user);

        return ResponseEntity.ok(Map.of("message", "Contraseña actualizada con éxito para " + user.getUsername()));
    }

    @PutMapping("/{id}/toggle-active")
    public ResponseEntity<?> toggleActive(@PathVariable Long id) {
        if (isNotSistemas()) {
            return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado: solo el administrador de Sistemas puede modificar el estado de cuentas."));
        }
        User currentUser = userHelper.getCurrentUser();
        User user = userRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado."));

        if (user.getId().equals(currentUser.getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "No puedes privar tu propia cuenta activa."));
        }

        user.setActive(!user.isActive());
        userRepo.save(user);

        String status = user.isActive() ? "activado" : "privado (bloqueado)";
        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "active", user.isActive(),
                "message", "Usuario " + user.getUsername() + " ahora está " + status
        ));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        if (isNotSistemas()) {
            return ResponseEntity.status(403).body(Map.of("message", "Acceso denegado: solo el administrador de Sistemas puede dar de baja usuarios."));
        }
        User currentUser = userHelper.getCurrentUser();
        User user = userRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado."));

        if (user.getId().equals(currentUser.getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "No puedes eliminar tu propia cuenta en sesión."));
        }

        if ("Osiris".equalsIgnoreCase(user.getUsername())) {
            return ResponseEntity.badRequest().body(Map.of("message", "No se permite eliminar al usuario principal Osiris."));
        }

        userRepo.delete(user);
        return ResponseEntity.ok(Map.of("message", "Usuario " + user.getUsername() + " eliminado permanentemente."));
    }
}
