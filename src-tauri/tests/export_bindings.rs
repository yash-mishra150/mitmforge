//! `npm run gen:bindings` (cargo test --test export_bindings) regenerates
//! `src/bindings.ts` without launching the app.

#[test]
fn export_bindings() {
    mitmforge_lib::export_bindings(&mitmforge_lib::specta_builder());
}
