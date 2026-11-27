# NextStep character artwork packs

The current procedural avatars remain an explicitly labeled prototype. The approved hockey character artwork must be supplied as a real, textured modular GLB; an empty catalog intentionally does not activate an asset pack.

Publish original or properly licensed assets only. Never include children's photos, names or personal data in generated assets. Use a neutral original stylized character inspired by the approved reference, not a branded replica.

## Catalog format

Add the self-contained .glb under this directory, then register its outfit in manifest.json:

    {
      "version": 1,
      "packs": {
        "hockey": {
          "file": "hockey-v1.glb",
          "outfit": "hockey",
          "credit": "Original NextStep character, artist/source/license",
          "revision": "1"
        }
      }
    }

Asset requirements:
- glTF 2.0 binary, Y up and +Z front, feet at floor, PBR materials, embedded resources, maximum 24 MiB (target < 5 MiB and 40k–80k triangles). No decoder dependencies or external resource URLs.
- One posed character with natural stylized proportions, expressive face, modeled helmet, jersey, hockey pants, gloves, skates, and detailed stick; bake fabric, leather, stitching and normal detail. Separate named meshes for variants; preserve placement and consistent topology. A humanoid rig is preferred for future animation.
- Unique mesh/group names: hair_short, hair_swept, hair_curly, hair_long; accessory_glasses, accessory_freckles, accessory_star; companion_fox, companion_robot; for hockey: position_skater and position_goalie. A bald/none selection hides corresponding optional groups. Put common geometry outside variant groups. Companion nodes are excluded in portrait mode. Pose variants contain only the differing gear; common base character is shared.
- Material names tint_skin, tint_hair, tint_iris, tint_primary, tint_secondary, and (hockey) tint_helmet. Neutral base-color textures for these slots allow color tinting without losing fabric and surface detail. Other materials retain original textures.
- For hockey add jersey_number, a separate front/back UV decal surface with the number UVs in the 0–1 square. It is dynamically textured by the client; keep it outside the main fabric mesh.

Review actual skater and goalie renders, color variants, every hairstyle, avatar rotation and device performance before marking the graphics acceptance test passed. The software asset loader is not a substitute for the finished artwork.
