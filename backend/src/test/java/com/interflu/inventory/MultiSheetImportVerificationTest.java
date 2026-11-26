package com.interflu.inventory;

import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import com.interflu.inventory.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:sqlite:target/test_import_verify.db",
    "spring.jpa.hibernate.ddl-auto=update"
})
public class MultiSheetImportVerificationTest {

    @Autowired private CountService countService;
    @Autowired private CountRecordRepository countRepo;
    @Autowired private InventorySessionRepository sessionRepo;
    @Autowired private ShelfRepository shelfRepo;
    @Autowired private ShelfAssignmentRepository assignmentRepo;
    @Autowired private ProductRepository productRepo;
    @Autowired private UserRepository userRepo;

    private static final String EXCEL_ACERO_MULTI =
        "C:\\Users\\ernes\\.gemini\\antigravity\\brain\\414f7d82-ca1a-40ce-87e7-48761bb7115d\\.user_uploaded\\media_1795589154481_4e79d3d5.xlsx";

    private static final String EXCEL_SAE_PLAIN =
        "C:\\Users\\ernes\\.gemini\\antigravity\\brain\\5efbd86a-e787-4cee-be52-5561f2a71a32\\.user_uploaded\\media_1795492702993_57d64739.xlsx";

    private MockMultipartFile loadXlsx(String path, String originalName) throws Exception {
        try (FileInputStream fis = new FileInputStream(new File(path))) {
            return new MockMultipartFile(
                "file",
                originalName,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fis
            );
        }
    }

    @Test
    void testMultiSheetDistributionExactTotalsFormulaAndSaeFlow() throws Exception {
        User user = userRepo.findByUsername("sistemas").orElseThrow();
        InventorySession session = sessionRepo.findAll().get(0);

        countRepo.deleteAll();
        countRepo.flush();

        // SCENARIO 1: Clean DB -> Import multi-sheet Acero workbook
        Map<String, Object> res1 = countService.importExcelCounts(
            session.getId(), null, "SMART_MERGE", true, "acero",
            loadXlsx(EXCEL_ACERO_MULTI, "ACEROS_CONTEO.xlsx"), user
        );

        assertEquals(697, ((Number) res1.get("importedRecords")).intValue());
        assertEquals(18015.0, ((Number) res1.get("totalPieces")).doubleValue(), 0.01);
        assertEquals(16, ((Number) res1.get("shelvesUpdated")).intValue());

        Double dbTotal1 = countRepo.sumQuantityBySessionId(session.getId());
        long dbCount1 = countRepo.countBySessionId(session.getId());
        assertEquals(697L, dbCount1, "DB must hold all 697 rows without losing multi-level duplicates");
        assertEquals(18015.0, dbTotal1, 0.01, "DB total pieces must match Excel 18,015.0 exactly");

        // Verify PB-ACE-01 has ONLY its 61 items (2,397 pcs), NOT everything
        Shelf ace01 = shelfRepo.findByCodeIgnoreCase("PB-ACE-01").orElseThrow();
        Shelf ace02 = shelfRepo.findByCodeIgnoreCase("PB-ACE-02").orElseThrow();
        Shelf ace08 = shelfRepo.findByCodeIgnoreCase("PB-ACE-08").orElseThrow();
        Shelf ace09 = shelfRepo.findByCodeIgnoreCase("PB-ACE-09").orElseThrow();
        Shelf ace19 = shelfRepo.findByCodeIgnoreCase("PB-ACE-19").orElseThrow();

        assertEquals(61L, countRepo.countBySessionIdAndShelfId(session.getId(), ace01.getId()));
        assertEquals(2397.0, countRepo.sumQuantityBySessionAndShelf(session.getId(), ace01.getId()), 0.01);
        assertEquals(53L, countRepo.countBySessionIdAndShelfId(session.getId(), ace02.getId()));
        assertEquals(2252.0, countRepo.sumQuantityBySessionAndShelf(session.getId(), ace02.getId()), 0.01);
        assertEquals(46L, countRepo.countBySessionIdAndShelfId(session.getId(), ace08.getId()));
        assertEquals(52L, countRepo.countBySessionIdAndShelfId(session.getId(), ace09.getId()));
        assertEquals(31L, countRepo.countBySessionIdAndShelfId(session.getId(), ace19.getId()));

        // Verify Excel formula in notes was evaluated cleanly (never raw B51&C51...)
        List<CountRecord> ace02Recs = countRepo.findBySessionIdAndShelfId(session.getId(), ace02.getId());
        for (CountRecord r : ace02Recs) {
            assertNotNull(r.getNotes(), "Location code note should be populated");
            assertFalse(r.getNotes().contains("&"), "Location note must NOT contain raw Excel formula: " + r.getNotes());
        }

        // Verify NN8011/4X4 exists cleanly in BOTH Level D (26) and Level G (13) of PB-ACE-08
        List<CountRecord> nn80Recs = countRepo.findAllBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(
            session.getId(), ace08.getId(), "NN8011/4X4"
        );
        assertEquals(2, nn80Recs.size(), "NN8011/4X4 must preserve both D and G bin records on Shelf 8");
        assertTrue(nn80Recs.stream().anyMatch(r -> "D".equals(r.getSection()) && r.getQuantity() == 26.0));
        assertTrue(nn80Recs.stream().anyMatch(r -> "G".equals(r.getSection()) && r.getQuantity() == 13.0));

        // Verify all 16 affected shelves are marked COMPLETADO (green)
        for (String code : Arrays.asList("PB-ACE-01", "PB-ACE-02", "PB-ACE-03", "PB-ACE-04", "PB-ACE-05",
                "PB-ACE-06", "PB-ACE-07", "PB-ACE-08", "PB-ACE-09", "PB-ACE-10", "PB-ACE-11",
                "PB-ACE-15", "PB-ACE-16", "PB-ACE-17", "PB-ACE-18", "PB-ACE-19")) {
            Shelf sh = shelfRepo.findByCodeIgnoreCase(code).orElseThrow();
            ShelfAssignment sa = assignmentRepo.findBySessionIdAndShelfId(session.getId(), sh.getId()).orElseThrow();
            assertEquals(ShelfAssignment.Status.COMPLETADO, sa.getStatus(), "Shelf " + code + " must be COMPLETADO (green)");
        }

        // SCENARIO 2: Re-import with targetShelfId = PB-ACE-01 and WEEKLY_UPDATE mode -> 100% idempotent
        Map<String, Object> res2 = countService.importExcelCounts(
            session.getId(), ace01.getId(), "WEEKLY_UPDATE", true, "acero",
            loadXlsx(EXCEL_ACERO_MULTI, "ACEROS_CONTEO.xlsx"), user
        );
        assertEquals(18015.0, ((Number) res2.get("totalPieces")).doubleValue(), 0.01);
        assertEquals(697L, countRepo.countBySessionId(session.getId()));
        assertEquals(18015.0, countRepo.sumQuantityBySessionId(session.getId()), 0.01);
        assertEquals(61L, countRepo.countBySessionIdAndShelfId(session.getId(), ace01.getId()));

        // SCENARIO 3: Simulate corrupted prior state where everything + 356 extra pieces were trapped in PB-ACE-01!
        List<CountRecord> allNow = countRepo.findBySessionIdOrderByIdAsc(session.getId());
        for (CountRecord r : allNow) {
            r.setShelf(ace01);
        }
        countRepo.saveAll(allNow);
        // Add an extra 356-piece stranded junk row on ace01 (simulating old 18,371 total!)
        Product dummyProd = productRepo.findAll().get(0);
        CountRecord junk = new CountRecord();
        junk.setSession(session);
        junk.setShelf(ace01);
        junk.setProduct(dummyProd);
        junk.setCapturedCode("STRANDED-JUNK-356");
        junk.setQuantity(356.0);
        junk.setUser(user);
        junk.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
        countRepo.saveAndFlush(junk);
        assertEquals(18371.0, countRepo.sumQuantityBySessionId(session.getId()), 0.01);

        // Now re-import the multi-sheet workbook cleanly even with targetShelfId = PB-ACE-01 and SMART_MERGE
        Map<String, Object> res3 = countService.importExcelCounts(
            session.getId(), ace01.getId(), "SMART_MERGE", true, "acero",
            loadXlsx(EXCEL_ACERO_MULTI, "ACEROS_CONTEO.xlsx"), user
        );
        assertEquals(18015.0, ((Number) res3.get("totalPieces")).doubleValue(), 0.01);
        assertEquals(697L, countRepo.countBySessionId(session.getId()), "Corrupted dump on Anaquel 1 must cleanly redistribute back to 697");
        assertEquals(18015.0, countRepo.sumQuantityBySessionId(session.getId()), 0.01, "Total pieces after recovery must equal 18015");
        assertEquals(61L, countRepo.countBySessionIdAndShelfId(session.getId(), ace01.getId()), "Anaquel 1 must return to exact 61 items");

        // SCENARIO 4: Import plain SAE export (no shelf/level) -> keeps existing defined items intact, sends unknown/ELIMINAR to PB-PEN-01
        Map<String, Object> res4 = countService.importExcelCounts(
            session.getId(), null, "WEEKLY_UPDATE", true, "acero",
            loadXlsx(EXCEL_SAE_PLAIN, "SAE_ACERO.xlsx"), user
        );
        assertTrue(((Number) res4.get("importedRecords")).intValue() > 400);
        Shelf pen01 = shelfRepo.findByCodeIgnoreCase("PB-PEN-01").orElseThrow();
        long penCount = countRepo.countBySessionIdAndShelfId(session.getId(), pen01.getId());
        assertTrue(penCount > 0, "Unlocated SAE items must go to PB-PEN-01 as NO DEFINIDO instead of polluting PB-ACE-01");
        assertEquals(61L, countRepo.countBySessionIdAndShelfId(session.getId(), ace01.getId()), "PB-ACE-01 must NOT be polluted by unlocated SAE items");
        ShelfAssignment penAssign = assignmentRepo.findBySessionIdAndShelfId(session.getId(), pen01.getId()).orElseThrow();
        assertNotEquals(ShelfAssignment.Status.COMPLETADO, penAssign.getStatus(), "PB-PEN-01 with undefined SAE items must not be marked COMPLETADO");

        // SCENARIO 5: Level S (Superior) CSV import works on both Planta Baja & Planta Alta
        String csvLevelS = "CLAVE,PLANTA,PASILLO,ESTANTE,NIVEL,POSICION,UBICACION,EXISTENCIAS\n"
                + "TEST-SUP-01,PB,3,1,S,1,PB3-1S-1,12\n";
        MockMultipartFile csvFile = new MockMultipartFile(
            "file", "nivel_s.csv", "text/csv", csvLevelS.getBytes(StandardCharsets.UTF_8)
        );
        countService.importExcelCounts(session.getId(), ace01.getId(), "SMART_MERGE", true, "acero", csvFile, user);
        Optional<CountRecord> supRec = countRepo.findBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(session.getId(), ace01.getId(), "TEST-SUP-01");
        assertTrue(supRec.isPresent());
        assertEquals("S", supRec.get().getSection());
        assertEquals("PB3-1S-1", supRec.get().getNotes());
    }
}
