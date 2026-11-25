;; Lean `String`, `ByteArray`, `Int` and a few fixed-width operations for the WasmGC backend.
;; Included by `Emit.lean` when a program uses them. The specification of each function is the
;; Lean definition its extern implements (named above it); positions are UTF-8 byte offsets.

;; A string is a view of the first `len` bytes of a buffer. Views of one buffer share its
;; prefix, and the buffer records how far anyone has written (`used`). Appending to a view whose
;; end is the buffer's end writes in place; any other append copies. So a string never changes
;; under anyone, without reference counts, and building a string byte by byte stays linear.
(type $bytes (array (mut i8)))
(type $buf (struct (field $data (mut (ref $bytes))) (field $used (mut i32))))
(type $str (struct (field $sb (ref $buf)) (field $slen i32)))
;; Int: 0 ≤ n < 2^30 is the same i31 as that Nat; anything else an $int (wraps beyond 64 bits).
(type $int (struct (field i64)))

;; How many times a `panic!` was reached (Lean returns the default value and carries on).
(global $panics (export "panics") (mut i32) (i32.const 0))

(func $s (param $v anyref) (result (ref $str)) (ref.cast (ref $str) (local.get $v)))
(func $slen (param $v anyref) (result i32) (struct.get $str $slen (call $s (local.get $v))))
(func $sdata (param $v anyref) (result (ref $bytes))
  (struct.get $buf $data (struct.get $str $sb (call $s (local.get $v)))))
(func $sbyte (param $v anyref) (param $i i32) (result i32)
  (array.get_u $bytes (call $sdata (local.get $v)) (local.get $i)))
;; A Nat as an i32 index, saturating (an index that large is out of range anyway).
(func $idx (param $n anyref) (result i32)
  (local $v i64)
  (local.set $v (call $nat_val (local.get $n)))
  (select (i32.wrap_i64 (local.get $v)) (i32.const 0x7fffffff)
    (i64.lt_u (local.get $v) (i64.const 0x7fffffff))))
(func $nat (param $i i32) (result anyref) (call $nat_mk (i64.extend_i32_u (local.get $i))))

(func $str_alloc (param $cap i32) (result (ref $str))
  (struct.new $str
    (struct.new $buf (array.new_default $bytes (local.get $cap)) (i32.const 0))
    (i32.const 0)))

;; `v`, or a copy of it, with room for `extra` bytes after its end that no other view can see.
(func $str_room (param $v anyref) (param $extra i32) (result (ref $str))
  (local $s (ref $str)) (local $b (ref $buf)) (local $n i32) (local $need i32)
  (local $cap i32) (local $d (ref $bytes))
  (local.set $s (call $s (local.get $v)))
  (local.set $b (struct.get $str $sb (local.get $s)))
  (local.set $n (struct.get $str $slen (local.get $s)))
  (local.set $need (i32.add (local.get $n) (local.get $extra)))
  (if (i32.eq (struct.get $buf $used (local.get $b)) (local.get $n))
    (then
      (if (i32.le_u (local.get $need) (array.len (struct.get $buf $data (local.get $b))))
        (then (return (local.get $s))))
      ;; grow the buffer itself: every view of it only reads the prefix, which is copied
      (local.set $cap (i32.shl (array.len (struct.get $buf $data (local.get $b))) (i32.const 1)))
      (if (i32.lt_u (local.get $cap) (local.get $need)) (then (local.set $cap (local.get $need))))
      (local.set $d (array.new_default $bytes (local.get $cap)))
      (array.copy $bytes $bytes (local.get $d) (i32.const 0)
        (struct.get $buf $data (local.get $b)) (i32.const 0) (local.get $n))
      (struct.set $buf $data (local.get $b) (local.get $d))
      (return (local.get $s))))
  ;; someone has appended past our end: copy
  (local.set $cap (i32.shl (local.get $n) (i32.const 1)))
  (if (i32.lt_u (local.get $cap) (local.get $need)) (then (local.set $cap (local.get $need))))
  (if (i32.lt_u (local.get $cap) (i32.const 16)) (then (local.set $cap (i32.const 16))))
  (local.set $d (array.new_default $bytes (local.get $cap)))
  (array.copy $bytes $bytes (local.get $d) (i32.const 0)
    (struct.get $buf $data (local.get $b)) (i32.const 0) (local.get $n))
  (struct.new $str (struct.new $buf (local.get $d) (local.get $n)) (local.get $n)))

;; The view `s` (with room made by $str_room) extended by `k` bytes written after it.
(func $str_grown (param $s (ref $str)) (param $k i32) (result (ref $str))
  (local $n i32)
  (local.set $n (i32.add (struct.get $str $slen (local.get $s)) (local.get $k)))
  (struct.set $buf $used (struct.get $str $sb (local.get $s)) (local.get $n))
  (struct.new $str (struct.get $str $sb (local.get $s)) (local.get $n)))

(func $utf8_size (param $c i32) (result i32)
  (if (result i32) (i32.lt_u (local.get $c) (i32.const 0x80)) (then (i32.const 1))
    (else (if (result i32) (i32.lt_u (local.get $c) (i32.const 0x800)) (then (i32.const 2))
      (else (if (result i32) (i32.lt_u (local.get $c) (i32.const 0x10000)) (then (i32.const 3))
        (else (i32.const 4))))))))

;; Size of the character whose first byte is `c` (a stray continuation byte counts as one).
(func $lead_size (param $c i32) (result i32)
  (if (result i32) (i32.eq (i32.and (local.get $c) (i32.const 0xe0)) (i32.const 0xc0))
    (then (i32.const 2))
    (else (if (result i32) (i32.eq (i32.and (local.get $c) (i32.const 0xf0)) (i32.const 0xe0))
      (then (i32.const 3))
      (else (if (result i32) (i32.eq (i32.and (local.get $c) (i32.const 0xf8)) (i32.const 0xf0))
        (then (i32.const 4))
        (else (i32.const 1))))))))

(func $is_first (param $c i32) (result i32)
  (i32.ne (i32.and (local.get $c) (i32.const 0xc0)) (i32.const 0x80)))

;; String.push
(func $str_push (param $v anyref) (param $c i32) (result anyref)
  (local $s (ref $str)) (local $d (ref $bytes)) (local $n i32) (local $k i32)
  (local.set $k (call $utf8_size (local.get $c)))
  (local.set $s (call $str_room (local.get $v) (local.get $k)))
  (local.set $d (struct.get $buf $data (struct.get $str $sb (local.get $s))))
  (local.set $n (struct.get $str $slen (local.get $s)))
  (if (i32.eq (local.get $k) (i32.const 1))
    (then (array.set $bytes (local.get $d) (local.get $n) (local.get $c)))
    (else (if (i32.eq (local.get $k) (i32.const 2))
      (then
        (array.set $bytes (local.get $d) (local.get $n)
          (i32.or (i32.const 0xc0) (i32.shr_u (local.get $c) (i32.const 6))))
        (array.set $bytes (local.get $d) (i32.add (local.get $n) (i32.const 1))
          (i32.or (i32.const 0x80) (i32.and (local.get $c) (i32.const 0x3f)))))
      (else (if (i32.eq (local.get $k) (i32.const 3))
        (then
          (array.set $bytes (local.get $d) (local.get $n)
            (i32.or (i32.const 0xe0) (i32.shr_u (local.get $c) (i32.const 12))))
          (array.set $bytes (local.get $d) (i32.add (local.get $n) (i32.const 1))
            (i32.or (i32.const 0x80) (i32.and (i32.shr_u (local.get $c) (i32.const 6)) (i32.const 0x3f))))
          (array.set $bytes (local.get $d) (i32.add (local.get $n) (i32.const 2))
            (i32.or (i32.const 0x80) (i32.and (local.get $c) (i32.const 0x3f)))))
        (else
          (array.set $bytes (local.get $d) (local.get $n)
            (i32.or (i32.const 0xf0) (i32.shr_u (local.get $c) (i32.const 18))))
          (array.set $bytes (local.get $d) (i32.add (local.get $n) (i32.const 1))
            (i32.or (i32.const 0x80) (i32.and (i32.shr_u (local.get $c) (i32.const 12)) (i32.const 0x3f))))
          (array.set $bytes (local.get $d) (i32.add (local.get $n) (i32.const 2))
            (i32.or (i32.const 0x80) (i32.and (i32.shr_u (local.get $c) (i32.const 6)) (i32.const 0x3f))))
          (array.set $bytes (local.get $d) (i32.add (local.get $n) (i32.const 3))
            (i32.or (i32.const 0x80) (i32.and (local.get $c) (i32.const 0x3f))))))))))
  (call $str_grown (local.get $s) (local.get $k)))

;; String.pushn
(func $str_pushn (param $v anyref) (param $c i32) (param $n anyref) (result anyref)
  (local $i i32)
  (local.set $i (call $idx (local.get $n)))
  (block $done (loop $more
    (br_if $done (i32.eqz (local.get $i)))
    (local.set $v (call $str_push (local.get $v) (local.get $c)))
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (br $more)))
  (local.get $v))

;; String.append
(func $str_append (param $v anyref) (param $t anyref) (result anyref)
  (local $s (ref $str)) (local $k i32)
  (local.set $k (call $slen (local.get $t)))
  (local.set $s (call $str_room (local.get $v) (local.get $k)))
  ;; read `t` after making room: if it shares our buffer, the buffer may have been replaced
  (array.copy $bytes $bytes (struct.get $buf $data (struct.get $str $sb (local.get $s)))
    (struct.get $str $slen (local.get $s)) (call $sdata (local.get $t)) (i32.const 0) (local.get $k))
  (call $str_grown (local.get $s) (local.get $k)))

;; String.utf8ByteSize
(func $str_byte_size (param $v anyref) (result anyref) (ref.i31 (call $slen (local.get $v))))

;; String.getUTF8Byte
(func $str_get_byte (param $v anyref) (param $i anyref) (result i32)
  (call $sbyte (local.get $v) (call $idx (local.get $i))))

;; The character starting at byte `i` (Lean's default character 'A' at or past the end).
(func $str_decode (param $v anyref) (param $i i32) (result i32)
  (local $c i32) (local $k i32)
  (if (i32.ge_u (local.get $i) (call $slen (local.get $v))) (then (return (i32.const 65))))
  (local.set $c (call $sbyte (local.get $v) (local.get $i)))
  (if (i32.lt_u (local.get $c) (i32.const 0x80)) (then (return (local.get $c))))
  (local.set $k (call $lead_size (local.get $c)))
  (if (i32.eq (local.get $k) (i32.const 2))
    (then (return (i32.or (i32.shl (i32.and (local.get $c) (i32.const 0x1f)) (i32.const 6))
      (i32.and (call $sbyte (local.get $v) (i32.add (local.get $i) (i32.const 1))) (i32.const 0x3f))))))
  (if (i32.eq (local.get $k) (i32.const 3))
    (then (return (i32.or (i32.or
      (i32.shl (i32.and (local.get $c) (i32.const 0x0f)) (i32.const 12))
      (i32.shl (i32.and (call $sbyte (local.get $v) (i32.add (local.get $i) (i32.const 1))) (i32.const 0x3f)) (i32.const 6)))
      (i32.and (call $sbyte (local.get $v) (i32.add (local.get $i) (i32.const 2))) (i32.const 0x3f))))))
  (if (i32.eq (local.get $k) (i32.const 4))
    (then (return (i32.or (i32.or (i32.or
      (i32.shl (i32.and (local.get $c) (i32.const 0x07)) (i32.const 18))
      (i32.shl (i32.and (call $sbyte (local.get $v) (i32.add (local.get $i) (i32.const 1))) (i32.const 0x3f)) (i32.const 12)))
      (i32.shl (i32.and (call $sbyte (local.get $v) (i32.add (local.get $i) (i32.const 2))) (i32.const 0x3f)) (i32.const 6)))
      (i32.and (call $sbyte (local.get $v) (i32.add (local.get $i) (i32.const 3))) (i32.const 0x3f))))))
  (local.get $c))

;; String.Pos.Raw.get, String.decodeChar
(func $str_get (param $v anyref) (param $p anyref) (result i32)
  (call $str_decode (local.get $v) (call $idx (local.get $p))))

;; String.Pos.Raw.next, String.Pos.next: one character on (one byte past the end).
(func $str_next (param $v anyref) (param $p anyref) (result anyref)
  (local $i i32)
  (local.set $i (call $idx (local.get $p)))
  (if (i32.ge_u (local.get $i) (call $slen (local.get $v)))
    (then (return (call $nat (i32.add (local.get $i) (i32.const 1))))))
  (call $nat (i32.add (local.get $i)
    (call $lead_size (call $sbyte (local.get $v) (local.get $i))))))

;; String.Pos.Raw.prev: the start of the character before `p`.
(func $str_prev (param $v anyref) (param $p anyref) (result anyref)
  (local $i i32)
  (local.set $i (call $idx (local.get $p)))
  (if (i32.eqz (local.get $i)) (then (return (ref.i31 (i32.const 0)))))
  (if (i32.gt_u (local.get $i) (call $slen (local.get $v)))
    (then (local.set $i (call $slen (local.get $v)))))
  (local.set $i (i32.sub (local.get $i) (i32.const 1)))
  (block $done (loop $back
    (br_if $done (i32.eqz (local.get $i)))
    (br_if $done (call $is_first (call $sbyte (local.get $v) (local.get $i))))
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (br $back)))
  (call $nat (local.get $i)))

;; String.Pos.Raw.extract: bytes [b, e), empty unless b starts a character; an e inside a
;; character extends to the end (as Lean's runtime does).
(func $str_extract (param $v anyref) (param $pb anyref) (param $pe anyref) (result anyref)
  (local $b i32) (local $e i32) (local $n i32) (local $s (ref $str))
  (local.set $b (call $idx (local.get $pb)))
  (local.set $e (call $idx (local.get $pe)))
  (local.set $n (call $slen (local.get $v)))
  (if (i32.or (i32.ge_u (local.get $b) (local.get $e)) (i32.ge_u (local.get $b) (local.get $n)))
    (then (return (call $str_alloc (i32.const 0)))))
  (if (i32.eqz (call $is_first (call $sbyte (local.get $v) (local.get $b))))
    (then (return (call $str_alloc (i32.const 0)))))
  (if (i32.gt_u (local.get $e) (local.get $n)) (then (local.set $e (local.get $n))))
  (if (i32.lt_u (local.get $e) (local.get $n))
    (then (if (i32.eqz (call $is_first (call $sbyte (local.get $v) (local.get $e))))
      (then (local.set $e (local.get $n))))))
  (local.set $s (call $str_alloc (i32.sub (local.get $e) (local.get $b))))
  (array.copy $bytes $bytes (struct.get $buf $data (struct.get $str $sb (local.get $s))) (i32.const 0)
    (call $sdata (local.get $v)) (local.get $b) (i32.sub (local.get $e) (local.get $b)))
  (call $str_grown (local.get $s) (i32.sub (local.get $e) (local.get $b))))

;; String.length: the number of characters.
(func $str_length (param $v anyref) (result anyref)
  (local $i i32) (local $k i32) (local $n i32)
  (local.set $n (call $slen (local.get $v)))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $k (i32.add (local.get $k) (call $is_first (call $sbyte (local.get $v) (local.get $i)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $more)))
  (call $nat (local.get $k)))

;; String.Internal.offsetOfPos: the number of characters that start before `p`.
(func $str_offset_of_pos (param $v anyref) (param $p anyref) (result anyref)
  (local $i i32) (local $k i32) (local $n i32)
  (local.set $n (call $idx (local.get $p)))
  (if (i32.gt_u (local.get $n) (call $slen (local.get $v))) (then (local.set $n (call $slen (local.get $v)))))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $k (i32.add (local.get $k) (call $is_first (call $sbyte (local.get $v) (local.get $i)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $more)))
  (call $nat (local.get $k)))

;; String.Internal.posOf: where `c` first starts, or the end.
(func $str_pos_of (param $v anyref) (param $c i32) (result anyref)
  (local $i i32) (local $n i32)
  (local.set $n (call $slen (local.get $v)))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eq (call $str_decode (local.get $v) (local.get $i)) (local.get $c))
      (then (return (call $nat (local.get $i)))))
    (local.set $i (i32.add (local.get $i) (call $lead_size (call $sbyte (local.get $v) (local.get $i)))))
    (br $more)))
  (call $nat (local.get $n)))

;; Do `len` bytes of `a` from `i` and of `b` from `j` agree? (Both ranges are in bounds.)
(func $bytes_eq (param $a anyref) (param $i i32) (param $b anyref) (param $j i32) (param $len i32)
    (result i32)
  (local $k i32)
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $k) (local.get $len)))
    (if (i32.ne (call $sbyte (local.get $a) (i32.add (local.get $i) (local.get $k)))
                (call $sbyte (local.get $b) (i32.add (local.get $j) (local.get $k))))
      (then (return (i32.const 0))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $more)))
  (i32.const 1))

;; String.Slice.Pattern.Internal.memcmpStr
(func $str_memcmp (param $a anyref) (param $b anyref) (param $i anyref) (param $j anyref)
    (param $len anyref) (result i32)
  (call $bytes_eq (local.get $a) (call $idx (local.get $i)) (local.get $b) (call $idx (local.get $j))
    (call $idx (local.get $len))))

;; String.decEq
(func $str_eq (param $a anyref) (param $b anyref) (result i32)
  (if (i32.ne (call $slen (local.get $a)) (call $slen (local.get $b))) (then (return (i32.const 0))))
  (call $bytes_eq (local.get $a) (i32.const 0) (local.get $b) (i32.const 0) (call $slen (local.get $a))))

;; String.compare: UTF-8 byte order is code point order. Ordering.lt/eq/gt = 0/1/2.
(func $str_compare (param $a anyref) (param $b anyref) (result i32)
  (local $k i32) (local $n i32) (local $x i32) (local $y i32)
  (local.set $n (call $slen (local.get $a)))
  (if (i32.lt_u (call $slen (local.get $b)) (local.get $n)) (then (local.set $n (call $slen (local.get $b)))))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $k) (local.get $n)))
    (local.set $x (call $sbyte (local.get $a) (local.get $k)))
    (local.set $y (call $sbyte (local.get $b) (local.get $k)))
    (if (i32.lt_u (local.get $x) (local.get $y)) (then (return (i32.const 0))))
    (if (i32.gt_u (local.get $x) (local.get $y)) (then (return (i32.const 2))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $more)))
  (if (result i32) (i32.lt_u (call $slen (local.get $a)) (call $slen (local.get $b)))
    (then (i32.const 0))
    (else (select (i32.const 2) (i32.const 1)
      (i32.gt_u (call $slen (local.get $a)) (call $slen (local.get $b)))))))

;; String.ofList: from a List Char ([] = i31 0, c :: cs = $obj tag 1 [c, cs], c a boxed u32).
(func $str_of_list (param $l anyref) (result anyref)
  (local $s anyref) (local $f (ref $fields))
  (local.set $s (call $str_alloc (i32.const 16)))
  (block $done (loop $more
    (br_if $done (ref.test (ref i31) (local.get $l)))
    (local.set $f (struct.get $obj $fields (ref.cast (ref $obj) (local.get $l))))
    (local.set $s (call $str_push (local.get $s)
      (i31.get_u (ref.cast (ref i31) (array.get $fields (local.get $f) (i32.const 0))))))
    (local.set $l (array.get $fields (local.get $f) (i32.const 1)))
    (br $more)))
  (local.get $s))

;; USize.repr
(func $usize_repr (param $u i32) (result anyref)
  (local $n i64)
  (local $d (ref $bytes)) (local $i i32) (local $s (ref $str))
  (local.set $n (i64.extend_i32_u (local.get $u)))
  (local.set $d (array.new_default $bytes (i32.const 20)))
  (local.set $i (i32.const 20))
  (loop $more
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (array.set $bytes (local.get $d) (local.get $i)
      (i32.add (i32.const 48) (i32.wrap_i64 (i64.rem_u (local.get $n) (i64.const 10)))))
    (local.set $n (i64.div_u (local.get $n) (i64.const 10)))
    (br_if $more (i64.ne (local.get $n) (i64.const 0))))
  (local.set $s (call $str_alloc (i32.sub (i32.const 20) (local.get $i))))
  (array.copy $bytes $bytes (struct.get $buf $data (struct.get $str $sb (local.get $s))) (i32.const 0)
    (local.get $d) (local.get $i) (i32.sub (i32.const 20) (local.get $i)))
  (call $str_grown (local.get $s) (i32.sub (i32.const 20) (local.get $i))))

;; ByteArray: a $bytes array of exactly its size. ByteArray.mk from an Array UInt8.
(func $bytes_of_array (param $a anyref) (result anyref)
  (local $f (ref $fields)) (local $d (ref $bytes)) (local $i i32)
  (local.set $f (ref.cast (ref $fields) (local.get $a)))
  (local.set $d (array.new_default $bytes (array.len (local.get $f))))
  (block $done (loop $more
    (br_if $done (i32.ge_u (local.get $i) (array.len (local.get $f))))
    (array.set $bytes (local.get $d) (local.get $i)
      (i31.get_u (ref.cast (ref i31) (array.get $fields (local.get $f) (local.get $i)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $more)))
  (local.get $d))
;; ByteArray.get
(func $bytes_get (param $a anyref) (param $i anyref) (result i32)
  (array.get_u $bytes (ref.cast (ref $bytes) (local.get $a)) (call $idx (local.get $i))))

;; panicCore: Lean's runtime prints the message and returns the default value.
(func $panic (param $default anyref) (param $msg anyref) (result anyref)
  (global.set $panics (i32.add (global.get $panics) (i32.const 1)))
  (local.get $default))

;; System.Platform.getNumBits: USize is i32 here, as on any 32-bit platform.
(func $num_bits (param anyref) (result anyref) (ref.i31 (i32.const 32)))

;; Int
(func $int_val (param $v anyref) (result i64)
  (if (result i64) (ref.test (ref i31) (local.get $v))
    (then (i64.extend_i32_u (i31.get_u (ref.cast (ref i31) (local.get $v)))))
    (else (if (result i64) (ref.test (ref $int) (local.get $v))
      (then (struct.get $int 0 (ref.cast (ref $int) (local.get $v))))
      (else (struct.get $big 0 (ref.cast (ref $big) (local.get $v))))))))
(func $int_mk (param $n i64) (result anyref)
  (if (result anyref) (i64.lt_u (local.get $n) (i64.const 0x40000000))
    (then (ref.i31 (i32.wrap_i64 (local.get $n))))
    (else (struct.new $int (local.get $n)))))
(func $int_of_nat (param $n anyref) (result anyref) (call $int_mk (call $nat_val (local.get $n))))
(func $int_add (param $a anyref) (param $b anyref) (result anyref)
  (call $int_mk (i64.add (call $int_val (local.get $a)) (call $int_val (local.get $b)))))
(func $int_sub (param $a anyref) (param $b anyref) (result anyref)
  (call $int_mk (i64.sub (call $int_val (local.get $a)) (call $int_val (local.get $b)))))
(func $int_mul (param $a anyref) (param $b anyref) (result anyref)
  (call $int_mk (i64.mul (call $int_val (local.get $a)) (call $int_val (local.get $b)))))
(func $int_neg (param $a anyref) (result anyref)
  (call $int_mk (i64.sub (i64.const 0) (call $int_val (local.get $a)))))
(func $int_eq (param $a anyref) (param $b anyref) (result i32)
  (i64.eq (call $int_val (local.get $a)) (call $int_val (local.get $b))))
(func $int_le (param $a anyref) (param $b anyref) (result i32)
  (i64.le_s (call $int_val (local.get $a)) (call $int_val (local.get $b))))
(func $int_lt (param $a anyref) (param $b anyref) (result i32)
  (i64.lt_s (call $int_val (local.get $a)) (call $int_val (local.get $b))))
(func $int_nat_abs (param $a anyref) (result anyref)
  (local $v i64)
  (local.set $v (call $int_val (local.get $a)))
  (call $nat_mk (select (i64.sub (i64.const 0) (local.get $v)) (local.get $v)
    (i64.lt_s (local.get $v) (i64.const 0)))))

;; Nat.pow (traps past 2^63, like $nat_mul), Nat.shiftRight
(func $nat_pow (param $a anyref) (param $b anyref) (result anyref)
  (local $r anyref) (local $k i64)
  (local.set $r (ref.i31 (i32.const 1)))
  (local.set $k (call $nat_val (local.get $b)))
  (block $done (loop $more
    (br_if $done (i64.eqz (local.get $k)))
    (local.set $r (call $nat_mul (local.get $r) (local.get $a)))
    (local.set $k (i64.sub (local.get $k) (i64.const 1)))
    (br $more)))
  (local.get $r))
(func $nat_shiftr (param $a anyref) (param $b anyref) (result anyref)
  (local $k i64)
  (local.set $k (call $nat_val (local.get $b)))
  (if (result anyref) (i64.ge_u (local.get $k) (i64.const 64))
    (then (ref.i31 (i32.const 0)))
    (else (call $nat_mk (i64.shr_u (call $nat_val (local.get $a)) (local.get $k))))))

;; Fixed-width bits. Lean shifts by `b % width`; wasm's i32.shl does that for 32.
(func $u16_lt (param i32 i32) (result i32) (i32.lt_u (local.get 0) (local.get 1)))
(func $u16_or (param i32 i32) (result i32) (i32.or (local.get 0) (local.get 1)))
(func $u16_shl (param i32 i32) (result i32)
  (i32.and (i32.shl (local.get 0) (i32.and (local.get 1) (i32.const 15))) (i32.const 0xffff)))
(func $u16_to_u32 (param i32) (result i32) (local.get 0))
(func $u32_and (param i32 i32) (result i32) (i32.and (local.get 0) (local.get 1)))
(func $u32_or (param i32 i32) (result i32) (i32.or (local.get 0) (local.get 1)))
(func $u32_shl (param i32 i32) (result i32) (i32.shl (local.get 0) (local.get 1)))
(func $u32_to_nat (param i32) (result anyref) (call $nat_mk (i64.extend_i32_u (local.get 0))))
(func $u32_to_u16 (param i32) (result i32) (i32.and (local.get 0) (i32.const 0xffff)))
(func $u8_eq (param i32 i32) (result i32) (i32.eq (local.get 0) (local.get 1)))
(func $u8_to_nat (param i32) (result anyref) (ref.i31 (local.get 0)))
(func $usize_sub (param i32 i32) (result i32) (i32.sub (local.get 0) (local.get 1)))

;; Array.pop
(func $arr_pop (param $a anyref) (result anyref)
  (local $n i32) (local $b (ref $fields))
  (local.set $n (array.len (call $arr (local.get $a))))
  (if (i32.eqz (local.get $n)) (then (return (local.get $a))))
  (local.set $n (i32.sub (local.get $n) (i32.const 1)))
  (local.set $b (array.new_default $fields (local.get $n)))
  (array.copy $fields $fields (local.get $b) (i32.const 0) (call $arr (local.get $a)) (i32.const 0)
    (local.get $n))
  (local.get $b))
