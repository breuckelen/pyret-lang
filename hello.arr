provide {
    hello-world : hello-world
} end
provide-types *

data Hello:
    | hello
end

fun hello-world(h :: Hello):
  hello
end

