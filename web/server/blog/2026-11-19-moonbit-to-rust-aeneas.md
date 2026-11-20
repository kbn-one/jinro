---
title: MoonBit をやめて Rust + Aeneas へ
date: "2026-11-19"
summary: コアを MoonBit から Rust に移し、Aeneas 経由の Lean での検証と wasm のブラウザデモが動き始めました。
---

人狼エンジン jinro のコアを MoonBit から Rust に移しました。Rust のコードは
Charon と Aeneas で Lean に自動変換し、CI
で毎回証明を検査しています。今月は「死者は行動も投票もできない」をループの帰納法で証明し、仕様とずれていたハムスターの噛み耐性も直しました。wasm
コンポーネントは jco で JS に変換し、このサイトの wasm
ページからブラウザだけで村を作って 1 日ずつ進められます。
