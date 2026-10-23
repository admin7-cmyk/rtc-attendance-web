# Prototype model provenance — not a performance certification

Runtime: @vladmandic/human 3.3.6 from official npm, MIT. Package SHA256: 425e9c51dbbca0c8934362b170cb0d54c2529c11c654b3c03092b16e9d6ad3f7.
Bundled TensorFlow.js: Apache-2.0 (notices retained in original bundle).
blazeface.json/.bin, facemesh.json/.bin: converted MediaPipe models, Apache-2.0; upstream https://github.com/google-ai-edge/mediapipe and Human model metadata.
faceres.json/.bin: converted HSE_FaceRec_tf model, Apache-2.0; upstream https://github.com/av-savchenko/HSE_FaceRec_tf . Only global_pooling/Mean is executed, never the age/gender outputs.
Conversions: https://github.com/vladmandic/human/wiki/Models ; original model notices are inherited, independent of the runtime MIT license.
Licenses: LICENSE-human.txt and LICENSE-Apache-2.0.txt accompany these assets. Preserve them when distributing.
No InsightFace noncommercial weights are included. Human default description/emotion/iris/gesture/body/hand/object/segmentation are disabled. Anti-spoof models were NOT selected: upstream dataset/model provenance does not establish a suitable production liveness guarantee; test photo/video replay manually during feasibility.
This records published redistribution licenses, not a warranty of dataset provenance, participant consent, suitability or school compliance. Real collection and production acceptance require the approved pilot process.
