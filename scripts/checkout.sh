echo "Setting up 'checkout' demo"
{
    rm -rf demo
    mkdir demo
    cd demo
    git init meta
    cd meta
    touch README.md
    git add README.md
    git com -m "first"
    cd ..
    git init x
    cd x
    touch foo
    git add foo
    git com -m "first x"
    cd ..
    git init y
    cd y
    touch bar
    git add bar
    git com -m "first y"
    cd ..
    cd meta
    git meta include ../x x
    git meta include ../y y
    git meta commit -m "added subs"
    git meta checkout my-feature
    cd x
    echo foofoo >> foo
    cd ../y
    echo barbar >> bar
    cd ..
    git meta commit -am changes
    git meta checkout master
} &> /dev/null