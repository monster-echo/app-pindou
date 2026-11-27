cmake_minimum_required(VERSION 3.8)

set(CMAKE_SYSTEM_NAME iOS)
set(APP_NAME "Pindou"  CACHE STRING "Project Name")

project(${APP_NAME} CXX)

set(CC_PROJECT_DIR ${CMAKE_CURRENT_LIST_DIR})
set(CC_UI_RESOURCES)
set(CC_PROJ_SOURCES)
set(CC_ASSET_FILES)
set(CC_COMMON_SOURCES)
set(CC_ALL_SOURCES)

include(${CC_PROJECT_DIR}/../common/CMakeLists.txt)

# When building for Apple Silicon iOS Simulator, point external imported static
# libraries to Cocos's ios-m1-simulator slice instead of device ios/libs.
if(CMAKE_OSX_SYSROOT MATCHES "iphonesimulator")
    add_compile_options(-Wno-invalid-specialization)
    set(_SIM_LIBS "${COCOS_X_PATH}/external/ios-m1-simulator/libs")
    set(_SIM_INC "${COCOS_X_PATH}/external/ios-m1-simulator/include")
    if(EXISTS "${_SIM_LIBS}")
        foreach(_pair
            "crypto:libcrypto.a"
            "jpeg:libjpeg.a"
            "png:libpng.a"
            "ssl:libssl.a"
            "uv:libuv_a.a"
            "webp:libwebp.a"
            "websockets:libwebsockets.a"
            "v8_monolith:libv8_monolith.a"
            "tbb:libtbb_static.a"
            "freetype:libfreetype.a"
            "GenericCodeGen:glslang/libGenericCodeGen.a"
            "glslang:glslang/libglslang.a"
            "glslang-default-resource-limits:glslang/libglslang-default-resource-limits.a"
            "MachineIndependent:glslang/libMachineIndependent.a"
            "OGLCompiler:glslang/libOGLCompiler.a"
            "OSDependent:glslang/libOSDependent.a"
            "SPIRV:glslang/libSPIRV.a"
            "SPIRV-Tools:glslang/libSPIRV-Tools.a"
            "SPIRV-Tools-opt:glslang/libSPIRV-Tools-opt.a"
            "SPVRemapper:glslang/libSPVRemapper.a"
            "spirv-cross-core:spirv-cross/libspirv-cross-core.a"
            "spirv-cross-msl:spirv-cross/libspirv-cross-msl.a"
            "spirv-cross-glsl:spirv-cross/libspirv-cross-glsl.a"
        )
            string(REPLACE ":" ";" _kv "${_pair}")
            list(GET _kv 0 _tgt)
            list(GET _kv 1 _lib)
            if(TARGET ${_tgt} AND EXISTS "${_SIM_LIBS}/${_lib}")
                set_target_properties(${_tgt} PROPERTIES IMPORTED_LOCATION "${_SIM_LIBS}/${_lib}")
            endif()
        endforeach()
        if(TARGET v8_monolith AND EXISTS "${_SIM_INC}/v8")
            set_target_properties(v8_monolith PROPERTIES INTERFACE_INCLUDE_DIRECTORIES "${_SIM_INC}/v8")
        endif()
    endif()
endif()

set(EXECUTABLE_NAME ${APP_NAME}-mobile)

cc_ios_before_target(${EXECUTABLE_NAME})
add_executable(${EXECUTABLE_NAME} ${CC_ALL_SOURCES})
cc_ios_after_target(${EXECUTABLE_NAME})

if(CMAKE_OSX_SYSROOT MATCHES "iphonesimulator")
    set_target_properties(${EXECUTABLE_NAME} PROPERTIES
        XCODE_ATTRIBUTE_SUPPORTED_PLATFORMS "iphonesimulator iphoneos"
        "XCODE_ATTRIBUTE_EXCLUDED_ARCHS[sdk=iphonesimulator*]" ""
        "XCODE_ATTRIBUTE_VALID_ARCHS[sdk=iphonesimulator*]" "arm64"
    )
endif()
